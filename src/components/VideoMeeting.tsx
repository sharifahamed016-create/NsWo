/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Video, VideoOff, Users, Play, Square, ExternalLink, 
  Copy, Check, Shield, AlertCircle, Info, Maximize2, ArrowLeft,
  Sparkles, Globe, Lock, CheckCircle, RefreshCw, ClipboardList,
  Calendar, MessageSquare, Send, BookOpen, Clock, Trash2,
  Volume2, Mic, MicOff, LayoutGrid, Download, Trophy, Plus, Award, Share2
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { db } from '../lib/firebase';
import { useMembers } from '../hooks/useMembers';
import { sendWhatsAppMessage, triggerManualWhatsAppRedirect } from '../lib/whatsapp';
import { 
  doc, onSnapshot, setDoc, deleteDoc, collection, 
  addDoc, query, orderBy, limit, getDocs, serverTimestamp 
} from 'firebase/firestore';

interface ActiveMeetingData {
  roomName: string;
  title: string;
  agenda?: string;
  startedBy: string;
  startedAt: string;
  status: 'active' | 'closed';
}

interface AttendanceRecord {
  id?: string;
  name: string;
  memberId: string;
  joinedAt: string;
  photoURL?: string;
}

interface HistoricalMeeting {
  id?: string;
  title: string;
  agenda?: string;
  startedBy: string;
  startedAt: string;
}

interface ScheduledMeeting {
  id?: string;
  title: string;
  agenda?: string;
  dateTime: string;
  createdBy: string;
}

interface MemberRank {
  id: string;
  name: string;
  email: string;
  photoURL?: string;
  meetingsAttended: number;
  lastAttendedAt: string;
}

export default function VideoMeeting() {
  const { user, isAdmin, isModerator, language, settings } = useAppContext();
  const [activeMeeting, setActiveMeeting] = useState<ActiveMeetingData | null>(null);
  const [isJoined, setIsJoined] = useState(false);
  const [meetingTitleInput, setMeetingTitleInput] = useState('');
  const [meetingAgendaInput, setMeetingAgendaInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  
  // Navigation active tab inside the lobby viewport
  const [activeTab, setActiveTab] = useState<'lobby' | 'schedules' | 'rankings' | 'history' | 'whatsapp_broadcast'>('lobby');

  // Core upgrade states
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [history, setHistory] = useState<HistoricalMeeting[]>([]);
  const [scheduledMeetings, setScheduledMeetings] = useState<ScheduledMeeting[]>([]);
  const [rankings, setRankings] = useState<MemberRank[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // New scheduled form states
  const [scheduleTitle, setScheduleTitle] = useState('');
  const [scheduleAgenda, setScheduleAgenda] = useState('');
  const [scheduleDateTime, setScheduleDateTime] = useState('');

  // Browser Mic speaking & Spotlight Focus engine states
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const [isSpeakerFocus, setIsSpeakerFocus] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);

  // WhatsApp Broadcast & Meeting Center States
  const { members: orgMembers = [], loading: membersLoading = false } = useMembers();
  const [selectedBroadcastPreset, setSelectedBroadcastPreset] = useState<'all' | 'active' | 'due' | 'branch'>('all');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [broadcastMessageText, setBroadcastMessageText] = useState<string>('');
  const [meetingDateInput, setMeetingDateInput] = useState<string>('২৫ জুন ২০২৬');
  const [meetingTimeInputText, setMeetingTimeInputText] = useState<string>('রাত ৮:০০ টা');
  const [meetingTitleInputText, setMeetingTitleInputText] = useState<string>('মাসিক সাধারণ সভা');
  const [attendanceReportFilter, setAttendanceReportFilter] = useState<'all' | 'present' | 'absent'>('all');
  const [dispatchStatuses, setDispatchStatuses] = useState<Record<string, 'pending' | 'sent' | 'skipped'>>({});

  const isBn = language === 'bn';
  const themeHex = settings.themeColor || '#10b981';

  // Format Helper for app name clean room generators
  const cleanAppName = (settings.name || 'organization')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-');

  // Extract unique branches based on country or address
  const extractedBranches = useMemo(() => {
    const branches = new Set<string>();
    orgMembers.forEach(m => {
      if (m.address) {
        const parts = m.address.split(/[,|–-]/);
        const lastPart = parts[parts.length - 1]?.trim();
        if (lastPart && lastPart.length > 2 && lastPart.length < 25) {
          branches.add(lastPart);
        } else if (parts[0]) {
          const fs = parts[0].trim();
          if (fs.length > 2 && fs.length < 25) {
            branches.add(fs);
          }
        }
      }
      if (m.country && m.country.toLowerCase() !== 'bangladesh' && m.country.toLowerCase() !== 'bd') {
        branches.add(m.country.toUpperCase());
      }
    });
    return Array.from(branches);
  }, [orgMembers]);

  // Dynamic filter for recipients in queue
  const broadcastRecipients = useMemo(() => {
    return orgMembers.filter(m => {
      if (selectedBroadcastPreset === 'active') {
        return m.status === 'active';
      }
      if (selectedBroadcastPreset === 'due') {
        return m.totalDue > 0;
      }
      if (selectedBroadcastPreset === 'branch' && selectedBranch !== 'all') {
        const branchLower = selectedBranch.toLowerCase();
        return (m.address && m.address.toLowerCase().includes(branchLower)) || 
               (m.country && m.country.toLowerCase().includes(branchLower));
      }
      return true;
    });
  }, [orgMembers, selectedBroadcastPreset, selectedBranch]);

  // Dynamic Meeting URL selector
  const generatedMeetingUrl = useMemo(() => {
    if (activeMeeting) {
      return `https://meet.jit.si/${activeMeeting.roomName}`;
    }
    return `https://meet.jit.si/${cleanAppName}-conferencing-room`;
  }, [activeMeeting, cleanAppName]);

  // Automatically update the message template draft
  useEffect(() => {
    const orgName = settings.nameBn || settings.name || 'নাহিরেরটেক সমাজ কল্যাণ সংস্থা';
    const text = isBn ? `📢 *${meetingTitleInputText}*

আসসালামু আলাইকুম।

${orgName} এর মাসিক সভা অনুষ্ঠিত হবে।

📅 তারিখ: ${meetingDateInput}
🕗 সময়: ${meetingTimeInputText}
🎥 মিটিং লিংক: ${generatedMeetingUrl}

অনুগ্রহ করে নির্ধারিত সময়ে যোগদান করুন।

ধন্যবাদ।` : `📢 *${meetingTitleInputText}*

Greetings.

The monthly general assembly of "${orgName}" is scheduled to begin.

📅 Date: ${meetingDateInput}
🕗 Time: ${meetingTimeInputText}
🎥 Live Room URL: ${generatedMeetingUrl}

Please make sure to join the virtual chamber on time.

Thank you.`;

    setBroadcastMessageText(text);
  }, [meetingTitleInputText, meetingDateInput, meetingTimeInputText, generatedMeetingUrl, settings, isBn]);

  // Synchronize on active meeting loading
  useEffect(() => {
    if (activeMeeting) {
      setMeetingTitleInputText(activeMeeting.title);
      // Auto fill time / date based on formatted startedAt
      const start = new Date(activeMeeting.startedAt);
      const optionsTime: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
      const optionsDate: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
      
      setMeetingTimeInputText(start.toLocaleTimeString(isBn ? 'bn-BD' : 'en-US', optionsTime));
      setMeetingDateInput(start.toLocaleDateString(isBn ? 'bn-BD' : 'en-US', optionsDate));
    }
  }, [activeMeeting, isBn]);

  const handleOneClickMeetingCreation = async () => {
    setIsLoading(true);
    const uniqueRoomId = Math.random().toString(36).substring(2, 9);
    const roomSlug = `${cleanAppName}-assembly-${uniqueRoomId}`;

    const title = meetingTitleInputText || (isBn ? 'মাসিক সাধারণ সভা' : 'Monthly General Assembly');
    const agenda = isBn ? 'বিশেষ মাসিক আলোচনা সভা ও অগ্রগতি রিপোর্ট পেশ।' : 'Special assembly evaluation on monthly budgets.';

    const newMeeting: ActiveMeetingData = {
      roomName: roomSlug,
      title,
      agenda,
      startedBy: user?.displayName || 'Admin',
      startedAt: new Date().toISOString(),
      status: 'active'
    };

    if (isOfflineMode) {
      try {
        localStorage.setItem('nswo_active_meeting', JSON.stringify(newMeeting));
        localStorage.removeItem('nswo_local_attendance');
        setAttendance([]);
        setActiveMeeting(newMeeting);
        
        let storedHistory: any[] = [];
        try {
          const hist = localStorage.getItem('nswo_meeting_history');
          if (hist) storedHistory = JSON.parse(hist);
        } catch (e) {}
        storedHistory.unshift(newMeeting);
        localStorage.setItem('nswo_meeting_history', JSON.stringify(storedHistory.slice(0, 15)));
        setHistory(storedHistory.slice(0, 15));
      } catch (e) {}
    } else {
      try {
        await setDoc(doc(db, 'system_state', 'active_meeting'), newMeeting);
        await addDoc(collection(db, 'meeting_history'), {
          title,
          agenda,
          startedBy: user?.displayName || 'Admin',
          startedAt: new Date().toISOString(),
          createdAt: serverTimestamp()
        });
        fetchHistory();
      } catch (err) {
        console.warn("Firestore access error during one-click instantiation:", err);
      }
    }

    // Initialize dispatch status tracker for the target users
    const initialStatuses: Record<string, 'pending' | 'sent' | 'skipped'> = {};
    broadcastRecipients.forEach(m => {
      initialStatuses[m.id] = 'pending';
    });
    setDispatchStatuses(initialStatuses);
    
    setIsLoading(false);
    setActiveTab('whatsapp_broadcast');
    
    // Smooth alert feedback
    alert(isBn 
      ? '✅ সুরক্ষিত মিটিং লিংক তৈরি হয়েছে ও টাইম সেট আপ সফল!\nআপনি এখন নিচে এক ক্লিকে মেম্বারদের কাছে মেসেজ পাঠাতে পারেন।' 
      : '✅ Meeting Link and timing initialized successfully! Proceeding to broadcast tab.'
    );
  };

  const handleDispatchWhatsApp = async (member: any, customReminderText?: string) => {
    const rawNum = member.phone || '';
    const textToSend = customReminderText || broadcastMessageText;
    
    // Update local UI state to 'sent' when triggered 
    setDispatchStatuses(prev => ({
      ...prev,
      [member.id]: 'sent'
    }));

    // Trigger the premium automated backend Meta integration
    const response = await sendWhatsAppMessage({
      to: rawNum,
      text: textToSend
    });

    if (response.success && response.mode === 'api') {
      console.log(`[Automated WhatsApp] Dispatched successfully to ${member.name}`);
    } else {
      // If client feedback states that no system secrets are active, trigger the direct Whatsapp URI handler as pristine backup
      console.log(`[Manual Override Fallback] ${response.message}`);
      triggerManualWhatsAppRedirect(rawNum, textToSend);
    }
  };


  const handleSkipDispatch = (id: string) => {
    setDispatchStatuses(prev => ({
      ...prev,
      [id]: 'skipped'
    }));
  };

  const handleResetStatuses = () => {
    const initialStatuses: Record<string, 'pending' | 'sent' | 'skipped'> = {};
    broadcastRecipients.forEach(m => {
      initialStatuses[m.id] = 'pending';
    });
    setDispatchStatuses(initialStatuses);
  };

  // Real-time listener for current active meeting status & attendance
  useEffect(() => {
    const meetingDocRef = doc(db, 'system_state', 'active_meeting');
    
    const inQuotaExceeded = typeof window !== 'undefined' && 
      (!!(window as any).__firestore_quota_exceeded || localStorage.getItem('nswo_is_quota_exceeded') === 'true');

    if (inQuotaExceeded) {
      setIsOfflineMode(true);
      try {
        const stored = localStorage.getItem('nswo_active_meeting');
        if (stored) {
          setActiveMeeting(JSON.parse(stored));
        }
        const localHistory = localStorage.getItem('nswo_meeting_history');
        if (localHistory) {
          setHistory(JSON.parse(localHistory));
        }
      } catch (e) {
        console.warn("Could not read local active meeting", e);
      }
      return;
    }

    const unsubscribe = onSnapshot(meetingDocRef, (snap) => {
      if (snap.exists()) {
        setActiveMeeting(snap.data() as ActiveMeetingData);
      } else {
        setActiveMeeting(null);
      }
    }, (error) => {
      console.warn("Firestore listener failed, switching video meeting to local cached mode:", error);
      setIsOfflineMode(true);
    });

    return () => unsubscribe();
  }, []);

  // Sync scheduled meetings list
  useEffect(() => {
    if (isOfflineMode) {
      try {
        const stored = localStorage.getItem('nswo_scheduled_meetings');
        if (stored) setScheduledMeetings(JSON.parse(stored));
      } catch (e) {}
      return;
    }

    const q = query(collection(db, 'scheduled_meetings'), orderBy('dateTime', 'asc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const items: ScheduledMeeting[] = [];
      snap.forEach(doc => {
        items.push({ id: doc.id, ...doc.data() } as ScheduledMeeting);
      });
      setScheduledMeetings(items);
      try {
        localStorage.setItem('nswo_scheduled_meetings', JSON.stringify(items));
      } catch (e) {}
    }, (err) => {
      console.warn("Scheduled meetings listener failed, fallback to cache", err);
      try {
        const stored = localStorage.getItem('nswo_scheduled_meetings');
        if (stored) setScheduledMeetings(JSON.parse(stored));
      } catch (e) {}
    });

    return () => unsubscribe();
  }, [isOfflineMode]);

  // Sync Attendance Rankings list
  useEffect(() => {
    if (isOfflineMode) {
      try {
        const stored = localStorage.getItem('nswo_member_rankings');
        if (stored) setRankings(JSON.parse(stored));
      } catch (e) {}
      return;
    }

    const q = query(collection(db, 'member_meeting_rankings'), orderBy('meetingsAttended', 'desc'), limit(15));
    const unsubscribe = onSnapshot(q, (snap) => {
      const items: MemberRank[] = [];
      snap.forEach(doc => {
        items.push({ id: doc.id, ...doc.data() } as MemberRank);
      });
      setRankings(items);
      try {
        localStorage.setItem('nswo_member_rankings', JSON.stringify(items));
      } catch (e) {}
    }, (err) => {
      console.warn("Rankings listener failed, fallback to local database", err);
      try {
        const stored = localStorage.getItem('nswo_member_rankings');
        if (stored) setRankings(JSON.parse(stored));
      } catch (e) {}
    });

    return () => unsubscribe();
  }, [isOfflineMode]);

  // Fetch Attendance Log in real-time when a meeting is active
  useEffect(() => {
    if (!activeMeeting || isOfflineMode) {
      // Offline fallback reads from simulated state
      try {
        const currentLocals = localStorage.getItem('nswo_local_attendance');
        setAttendance(currentLocals ? JSON.parse(currentLocals) : []);
      } catch(e) {}
      return;
    }

    const attendanceRef = collection(db, 'system_state', 'active_meeting', 'attendance');
    const q = query(attendanceRef, orderBy('joinedAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snap) => {
      const records: AttendanceRecord[] = [];
      snap.forEach(doc => {
        records.push({ id: doc.id, ...doc.data() } as AttendanceRecord);
      });
      setAttendance(records);
    }, (err) => {
      console.warn("Failed fetching attendance list", err);
    });

    return () => unsubscribe();
  }, [activeMeeting, isOfflineMode]);

  // Fetch past meetings history
  const fetchHistory = async () => {
    if (isOfflineMode) {
      try {
        const localHistory = localStorage.getItem('nswo_meeting_history');
        if (localHistory) setHistory(JSON.parse(localHistory));
      } catch(e){}
      return;
    }

    try {
      const historyRef = collection(db, 'meeting_history');
      const q = query(historyRef, orderBy('startedAt', 'desc'), limit(15));
      const querySnap = await getDocs(q);
      const items: HistoricalMeeting[] = [];
      querySnap.forEach(doc => {
        items.push({ id: doc.id, ...doc.data() } as HistoricalMeeting);
      });
      setHistory(items);
      try {
        localStorage.setItem('nswo_meeting_history', JSON.stringify(items));
      } catch (e) {}
    } catch (e) {
      console.warn("Could not load history from server", e);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [activeMeeting, isOfflineMode]);

  // Real-time voice level detection using standard browser Web Audio API
  useEffect(() => {
    if (!isJoined) {
      setMicVolume(0);
      setIsSpeaking(false);
      return;
    }

    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let microphone: MediaStreamAudioSourceNode | null = null;
    let javascriptNode: ScriptProcessorNode | null = null;
    let stream: MediaStream | null = null;

    async function initAudio() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        javascriptNode = audioContext.createScriptProcessor(2048, 1, 1);

        analyser.smoothingTimeConstant = 0.8;
        analyser.fftSize = 1024;

        microphone.connect(analyser);
        analyser.connect(javascriptNode);
        javascriptNode.connect(audioContext.destination);

        javascriptNode.onaudioprocess = () => {
          if (!analyser) return;
          const array = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(array);
          let values = 0;

          const length = array.length;
          for (let i = 0; i < length; i++) {
            values += array[i];
          }

          const average = values / length;
          const volume = Math.round(average);
          setMicVolume(volume);
          setIsSpeaking(volume > 10); // 10 is ambient noise threshold for speaking activity
        };
      } catch (e: any) {
        console.warn("Web audio context access denied or not available", e);
        setMicError(e.message || "Microphone access blocked");
      }
    }

    // Delay audio init slightly to ensure iframe and browser permission sync cleanly
    const timer = setTimeout(() => {
      initAudio();
    }, 1000);

    return () => {
      clearTimeout(timer);
      try {
        if (javascriptNode) javascriptNode.disconnect();
        if (microphone) microphone.disconnect();
        if (analyser) analyser.disconnect();
        if (audioContext && audioContext.state !== 'closed') audioContext.close();
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
      } catch (e) {
        console.warn("Cleanup audio error", e);
      }
    };
  }, [isJoined]);

  const handleStartMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = meetingTitleInput.trim() || (isBn ? 'জরুরি আলোচনা সভা' : 'Emergency General Assembly');
    const agenda = meetingAgendaInput.trim() || '';
    
    setIsLoading(true);
    const uniqueId = Math.random().toString(36).substring(2, 9);
    const roomSlug = `${cleanAppName}-conf-room-${uniqueId}`;

    const newMeeting: ActiveMeetingData = {
      roomName: roomSlug,
      title,
      agenda,
      startedBy: user?.displayName || 'Admin',
      startedAt: new Date().toISOString(),
      status: 'active'
    };

    if (isOfflineMode) {
      try {
        localStorage.setItem('nswo_active_meeting', JSON.stringify(newMeeting));
        localStorage.removeItem('nswo_local_attendance');
        setAttendance([]);
        setActiveMeeting(newMeeting);
        
        let storedHistory: any[] = [];
        try {
          const hist = localStorage.getItem('nswo_meeting_history');
          if (hist) storedHistory = JSON.parse(hist);
        } catch (e) {}
        storedHistory.unshift(newMeeting);
        localStorage.setItem('nswo_meeting_history', JSON.stringify(storedHistory.slice(0, 15)));
        setHistory(storedHistory.slice(0, 15));
      } catch (err) {}
      setIsLoading(false);
      setMeetingTitleInput('');
      setMeetingAgendaInput('');
      return;
    }

    try {
      await setDoc(doc(db, 'system_state', 'active_meeting'), newMeeting);
      // Also write directly to history trail
      await addDoc(collection(db, 'meeting_history'), {
        title,
        agenda,
        startedBy: user?.displayName || 'Admin',
        startedAt: new Date().toISOString(),
        createdAt: serverTimestamp()
      });
      setMeetingTitleInput('');
      setMeetingAgendaInput('');
      fetchHistory();
    } catch (error) {
      console.error("Error launching meeting on Firestore, storing locally", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseMeeting = async () => {
    if (!window.confirm(isBn ? 'আপনি কি আসলেই লাইভ মিটিংটি সমাপ্ত করতে চান?' : 'Are you sure you want to close the live meeting?')) {
      return;
    }

    setIsLoading(true);
    if (isOfflineMode) {
      try {
        localStorage.removeItem('nswo_active_meeting');
        localStorage.removeItem('nswo_local_attendance');
        setAttendance([]);
        setActiveMeeting(null);
        setIsJoined(false);
      } catch (err) {}
      setIsLoading(false);
      return;
    }

    try {
      await deleteDoc(doc(db, 'system_state', 'active_meeting'));
      setIsJoined(false);
    } catch (error) {
      console.error("Error closing meeting", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Records user joining the meeting and pushes it to direct interactive attendance logs
  const handleJoinSession = async () => {
    setIsJoined(true);
    if (!activeMeeting || !user) return;

    const emailPrefix = user.email ? user.email.split('@')[0].toUpperCase() : 'MEMBER';
    const attendanceRecord: AttendanceRecord = {
      name: user.displayName || 'Anonymous Member',
      memberId: emailPrefix,
      joinedAt: new Date().toISOString(),
      photoURL: user.photoURL || ''
    };

    if (isOfflineMode) {
      try {
        const stored = localStorage.getItem('nswo_local_attendance');
        const list = stored ? JSON.parse(stored) : [];
        if (!list.some((a: any) => a.memberId === emailPrefix)) {
          list.push(attendanceRecord);
          localStorage.setItem('nswo_local_attendance', JSON.stringify(list));
          setAttendance(list);
        }

        // Locally update rankings count
        const ranksStored = localStorage.getItem('nswo_member_rankings');
        const ranks: MemberRank[] = ranksStored ? JSON.parse(ranksStored) : [];
        let rIndex = ranks.findIndex(r => r.id === (user.uid || 'guest'));
        if (rIndex > -1) {
          ranks[rIndex].meetingsAttended = (ranks[rIndex].meetingsAttended || 0) + 1;
          ranks[rIndex].lastAttendedAt = new Date().toISOString();
        } else {
          ranks.push({
            id: user.uid || 'guest',
            name: user.displayName || 'Anonymous Member',
            email: user.email || 'member@example.com',
            photoURL: user.photoURL || '',
            meetingsAttended: 1,
            lastAttendedAt: new Date().toISOString()
          });
        }
        ranks.sort((a, b) => b.meetingsAttended - a.meetingsAttended);
        localStorage.setItem('nswo_member_rankings', JSON.stringify(ranks));
        setRankings(ranks);
      } catch (e) {}
      return;
    }

    try {
      // 1. Log attendance on direct meeting session
      const attendanceRef = doc(db, 'system_state', 'active_meeting', 'attendance', user.uid || 'guest');
      await setDoc(attendanceRef, attendanceRecord);

      // 2. Increment user meeting statistics for ranking leaderboard
      const rankingRef = doc(db, 'member_meeting_rankings', user.uid || 'guest');
      let currentCount = 1;
      try {
        const rankingDocs = await getDocs(query(collection(db, 'member_meeting_rankings')));
        const existing = rankingDocs.docs.find(d => d.id === (user.uid || 'guest'));
        if (existing && existing.exists()) {
          currentCount = (existing.data().meetingsAttended || 0) + 1;
        }
      } catch (e) {}

      await setDoc(rankingRef, {
        name: user.displayName || 'Anonymous Member',
        email: user.email || 'member@example.com',
        photoURL: user.photoURL || '',
        meetingsAttended: currentCount,
        lastAttendedAt: new Date().toISOString()
      }, { merge: true });

    } catch (err) {
      console.warn("Could not log attendance trace", err);
    }
  };

  // Scheduled Meeting actions
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleTitle) return;

    const newSchedule: ScheduledMeeting = {
      title: scheduleTitle,
      agenda: scheduleAgenda,
      dateTime: scheduleDateTime || new Date(Date.now() + 86400000).toISOString().slice(0, 16),
      createdBy: user?.displayName || 'Admin'
    };

    setIsLoading(true);

    if (isOfflineMode) {
      try {
        const stored = JSON.parse(localStorage.getItem('nswo_scheduled_meetings') || '[]');
        const scheduledWithId = { id: Math.random().toString(36).substring(2, 9), ...newSchedule };
        stored.push(scheduledWithId);
        localStorage.setItem('nswo_scheduled_meetings', JSON.stringify(stored));
        setScheduledMeetings(stored);
        setScheduleTitle('');
        setScheduleAgenda('');
        setScheduleDateTime('');
        setShowScheduleModal(false);
      } catch (err) {}
      setIsLoading(false);
      return;
    }

    try {
      await addDoc(collection(db, 'scheduled_meetings'), {
        ...newSchedule,
        createdAt: serverTimestamp()
      });
      setScheduleTitle('');
      setScheduleAgenda('');
      setScheduleDateTime('');
      setShowScheduleModal(false);
    } catch (e) {
      console.error("Error creating scheduled meeting", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!window.confirm(isBn ? 'আপনি কি আসলেই এই তফশিলি সভাটি মুছে ফেলতে চান?' : 'Are you sure you want to cancel and delete this scheduled meeting?')) {
      return;
    }

    if (isOfflineMode) {
      try {
        const stored = JSON.parse(localStorage.getItem('nswo_scheduled_meetings') || '[]');
        const filtered = stored.filter((s: any) => s.id !== id);
        localStorage.setItem('nswo_scheduled_meetings', JSON.stringify(filtered));
        setScheduledMeetings(filtered);
      } catch (err) {}
      return;
    }

    try {
      await deleteDoc(doc(db, 'scheduled_meetings', id));
    } catch (e) {
      console.error("Error deleting schedule", e);
    }
  };

  const handleStartFromSchedule = async (sched: ScheduledMeeting) => {
    setIsLoading(true);
    const uniqueId = Math.random().toString(36).substring(2, 9);
    const roomSlug = `${cleanAppName}-conf-room-${uniqueId}`;

    const newMeeting: ActiveMeetingData = {
      roomName: roomSlug,
      title: sched.title,
      agenda: sched.agenda || '',
      startedBy: sched.createdBy || user?.displayName || 'Admin',
      startedAt: new Date().toISOString(),
      status: 'active'
    };

    if (isOfflineMode) {
      localStorage.setItem('nswo_active_meeting', JSON.stringify(newMeeting));
      localStorage.removeItem('nswo_local_attendance');
      setAttendance([]);
      setActiveMeeting(newMeeting);
      
      // Remove schedule locally
      try {
        const stored = JSON.parse(localStorage.getItem('nswo_scheduled_meetings') || '[]');
        const filtered = stored.filter((s: any) => s.id !== sched.id);
        localStorage.setItem('nswo_scheduled_meetings', JSON.stringify(filtered));
        setScheduledMeetings(filtered);
      } catch(e){}
      
      setIsLoading(false);
      setActiveTab('lobby');
      return;
    }

    try {
      await setDoc(doc(db, 'system_state', 'active_meeting'), newMeeting);
      await addDoc(collection(db, 'meeting_history'), {
        title: sched.title,
        agenda: sched.agenda || '',
        startedBy: sched.createdBy || user?.displayName || 'Admin',
        startedAt: new Date().toISOString(),
        createdAt: serverTimestamp()
      });
      if (sched.id) {
        await deleteDoc(doc(db, 'scheduled_meetings', sched.id));
      }
      fetchHistory();
      setActiveTab('lobby');
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  // Premium WhatsApp Auto Notification broadcast triggers
  const sendWhatsAppNotification = (sched: ScheduledMeeting) => {
    const meetTimeStr = new Date(sched.dateTime).toLocaleTimeString(language === 'bn' ? 'bn-BD' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
    const meetDateStr = new Date(sched.dateTime).toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });

    const text = isBn
      ? `*📢 নোটিশ: গুরুত্বপূর্ণ ভার্চুয়াল মাসিক সভা 📢*\n\nপ্রিয় সদস্য,\nআমাদের "${settings.nameBn || settings.name}" সংস্থার পক্ষ থেকে একটি মাসিক সাধারণ সভা অনুষ্ঠিত হতে যাচ্ছে। আপনাকে যথাসময়ে উপস্থিত থেকে ভার্চুয়াল সভায় অংশগ্রহণের জন্য অনুরোধ করা হচ্ছে।\n\n📌 *আলোচ্য বিষয়:* ${sched.title}\n⏰ *সময় এবং তারিখ:* ${meetDateStr}, ${meetTimeStr}\n\n👉 *মিটিংয়ে যোগদানের জন্য সংযোগ লিংক:* ${window.location.origin}\n\nঅনুগ্রহ করে নির্দিষ্ট সময়ে মিটিংয়ে যোগ দিন।\n\nধন্যবাদান্তে,\nএডমিন টিম`
      : `*📢 Notification: Important Monthly Assembly 📢*\n\nDear Member,\nA general monthly scheduled session of "${settings.name}" has been registered in the system.\n\n📌 *Meeting Title:* ${sched.title}\n⏰ *Time & Date:* ${meetDateStr} at ${meetTimeStr}\n\n👉 *Join Portal Link:* ${window.location.origin}\n\nPlease prepare to join the session on schedule.\n\nRegards,\nAdmin Team`;

    const encodedText = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?text=${encodedText}`, '_blank');
  };

  // CSV Attendance Report Downloader
  const downloadAttendanceCSV = () => {
    if (attendance.length === 0) {
      alert(isBn ? 'ডাউনলোড করার জন্য কোনো উপস্থিত মেম্বার পাওয়া যায়নি।' : 'No checked-in members found to compile report.');
      return;
    }

    let csvContent = "\uFEFF"; // Byte Order Mark for Excel CSV auto encoding
    if (isBn) {
      csvContent += "ক্রমিক নং,সদস্যের নাম,ইউজার ইমেইল আইডি,যুক্ত হওয়ার সময়\r\n";
    } else {
      csvContent += "Serial,Attendee Name,Member Email ID,Check-In Timestamp\r\n";
    }

    attendance.forEach((rec, idx) => {
      const serial = idx + 1;
      const cleanName = rec.name.replace(/"/g, '""');
      const cleanId = rec.memberId.replace(/"/g, '""');
      const formattedTime = new Date(rec.joinedAt).toLocaleString(language === 'bn' ? 'bn-BD' : 'en-US');
      csvContent += `${serial},"${cleanName}","${cleanId}","${formattedTime}"\r\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Attendance_Report_${activeMeeting?.title.replace(/[^a-zA-Z0-9]/g, '_') || 'Session'}_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getEmbedMeetingUrl = () => {
    if (!activeMeeting) return '';
    const userDisplayName = encodeURIComponent(user?.displayName || 'Anonymous Member');
    const userAvatarUrl = encodeURIComponent(user?.photoURL || 'https://ui-avatars.com/api/?name=User');

    const focusParams = isSpeakerFocus 
      ? '&config.tileViewEnabled=false&config.activeSpeakerDetection=true' 
      : '&config.tileViewEnabled=true&config.activeSpeakerDetection=true';

    return `https://meet.jit.si/${activeMeeting.roomName}#userInfo.displayName="${userDisplayName}"&userInfo.avatarUrl="${userAvatarUrl}"&config.prejoinPageEnabled=true&config.startWithAudioMuted=true&config.startWithVideoMuted=true&config.disableDeepLinking=true&interfaceConfig.DEFAULT_BACKGROUND='#020905'&interfaceConfig.DISABLE_VIDEO_BACKGROUND=true${focusParams}`;
  };

  const getDirectMeetingUrl = () => {
    if (!activeMeeting) return '';
    return `https://meet.jit.si/${activeMeeting.roomName}`;
  };

  const copyMeetingLink = () => {
    const directUrl = getDirectMeetingUrl();
    navigator.clipboard.writeText(directUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getShareTemplateText = () => {
    if (!activeMeeting) return '';
    const directUrl = getDirectMeetingUrl();
    const formattedDate = new Date(activeMeeting.startedAt).toLocaleString(language === 'bn' ? 'bn-BD' : 'en-US');
    
    if (isBn) {
      return `*🔴 ভার্চুয়াল আলোচনা সভা আমন্ত্রণপত্র 🔴*\n\nপ্রিয় সদস্য,\nআমাদের "${settings.nameBn || settings.name}" এর একটি ভার্চুয়াল মিটিং শুরু হয়েছে। আপনাকে নিচে দেওয়া লিংকে ক্লিক করে যুক্ত থাকার জন্য বিনীত অনুরোধ করা হচ্ছে।\n\n📌 *মিটিংয়ের বিষয়:* ${activeMeeting.title}\n${activeMeeting.agenda ? `📝 *আলোচ্যসূচি:* ${activeMeeting.agenda}\n` : ''}👤 *হোস্ট:* ${activeMeeting.startedBy}\n⏰ *শুরুর সময়:* ${formattedDate}\n\n👉 *মিটিং লিংক:* ${directUrl}\n\nধন্যবাদান্তে,\nএডমিন টিম`;
    } else {
      return `*🔴 Virtual Meeting Invitation 🔴*\n\nDear Member,\nYou are warmly invited to join the live video conference of "${settings.name}".\n\n📌 *Topic:* ${activeMeeting.title}\n${activeMeeting.agenda ? `📝 *Agenda:* ${activeMeeting.agenda}\n` : ''}👤 *Host:* ${activeMeeting.startedBy}\n⏰ *Time:* ${formattedDate}\n\n👉 *Join Link:* ${directUrl}\n\nRegards,\nAdmin Team`;
    }
  };

  const copyInviteMessage = () => {
    navigator.clipboard.writeText(getShareTemplateText());
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const toggleFullscreen = () => {
    const iframe = document.getElementById('jitsi-meeting-iframe');
    if (iframe) {
      if (iframe.requestFullscreen) {
        iframe.requestFullscreen();
      }
    }
  };

  const isLightColor = (hex?: string) => {
    if (!hex) return false;
    const c = hex.replace('#', '');
    if (c.length !== 6) return false;
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 170;
  };

  const isLight = isLightColor(settings.themeColor);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      
      {/* Top Banner */}
      <div 
        className="rounded-[2.2rem] p-6 md:p-8 space-y-3 relative overflow-hidden border transition-all duration-300"
        style={{
          backgroundColor: isLight ? '#ffffff' : 'rgba(3, 28, 17, 0.45)',
          borderColor: isLight ? '#e2e8f0' : 'rgba(16, 185, 129, 0.25)',
          boxShadow: '0 10px 30px -10px rgba(0,0,0,0.3)'
        }}
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-4 rounded-[1.4rem] bg-gradient-to-br from-indigo-500 to-amber-500 text-white shadow-md">
              <Video size={28} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-black tracking-widest text-[#10b981] bg-emerald-500/10 px-2 py-0.5 rounded-md">
                  {isBn ? 'প্রিমিয়াম ভিডিও সংযোগ' : 'PREMIUM VIRTUAL LOBBY'}
                </span>
                {isOfflineMode && (
                  <span className="text-[10px] uppercase font-black tracking-widest text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md flex items-center gap-1">
                    <Globe size={10} />
                    {isBn ? 'অফলাইন ব্যাকআপ সক্রিয়' : 'Offline Backup'}
                  </span>
                )}
              </div>
              <h2 className={`text-xl md:text-2xl font-black tracking-tight mt-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {isBn ? 'সুরক্ষিত ভিডিও কনফারেন্স ও স্মার্ট হাজিরা ট্র্যাকার' : 'Secure Assembly Portal & Smart Attendance Engine'}
              </h2>
              <p className={`text-xs mt-1 ${isLight ? 'text-slate-650' : 'text-slate-400'}`}>
                {isBn 
                  ? 'এক ক্লিকে জুম বা মিট স্টাইলে এইচডি মিটিং শুরু করুন, স্বয়ংক্রিয় হাজিরা খাতা এবং লিডারবোর্ড ট্র্যাক করুন।' 
                  : 'Start real-time Zoom/Meet-style interactive halls, log auto attendance audits, and view active leaderboard rankings.'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowScheduleModal(true)}
              className="px-4 py-2 rounded-xl text-xs font-black shadow-md transition-all hover:scale-[1.01] flex items-center gap-1.5 cursor-pointer"
              style={{
                backgroundColor: themeHex,
                color: isLightColor(themeHex) ? '#020b06' : '#ffffff'
              }}
            >
              <Plus size={14} />
              <span>{isBn ? 'সভা সেডিউল করুন' : 'Schedule Assembly'}</span>
            </button>
          </div>
        </div>
      </div>

      {!isJoined ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Main Left panel: Responsive tab dividers */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Visual tab buttons */}
            <div className="flex items-center gap-1 p-1 bg-black/15 dark:bg-black/45 rounded-2xl border border-white/[0.03] overflow-x-auto">
              {[
                { id: 'lobby', labelBn: 'লাইভ লবি', labelEn: 'Live Lobby', icon: Play },
                { id: 'schedules', labelBn: 'তফশিলি সভা', labelEn: 'Schedules', icon: Calendar },
                ...(isAdmin || isModerator ? [{ id: 'whatsapp_broadcast', labelBn: 'হোয়াটসঅ্যাপ ব্রডকাস্ট 📢', labelEn: 'WA Broadcast 📢', icon: Send }] : []),
                { id: 'rankings', labelBn: 'সদস্য র্যাংকিং', labelEn: 'Leaderboard', icon: Trophy },
                { id: 'history', labelBn: 'মিটিং রেকর্ড', labelEn: 'Past Logs', icon: ClipboardList },
              ].map(tab => {
                const IconComponent = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                      isActive 
                        ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-950 shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <IconComponent size={13} style={isActive ? { color: themeHex } : {}} />
                    <span>{isBn ? tab.labelBn : tab.labelEn}</span>
                  </button>
                );
              })}
            </div>

            {/* TAB CONTENT: Lobby */}
            {activeTab === 'lobby' && (
              <div 
                className="rounded-[2.2rem] p-6 border relative transition-all duration-300 space-y-6"
                style={{
                  backgroundColor: isLight ? '#ffffff' : 'rgba(1, 9, 6, 0.6)',
                  borderColor: isLight ? '#cbd5e1' : 'rgba(255,255,255,0.06)'
                }}
              >
                <div className="flex items-center justify-between">
                  <h3 className={`text-xs font-black uppercase tracking-widest ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {isBn ? 'সক্রিয় কলার রুম' : 'Active Connection Lobby'}
                  </h3>
                  {activeMeeting ? (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-[#10b981]/10 rounded-full border border-[#10b981]/20">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#10b981] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#10b981]"></span>
                      </span>
                      <span className="text-[10px] font-black tracking-wider text-[#10b981] uppercase animate-pulse">
                        {isBn ? 'মিটিং চলছে' : 'Live Assembly'}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] font-black tracking-wider text-slate-400 uppercase bg-slate-100 dark:bg-black/30 px-3 py-1 rounded-full">
                      {isBn ? 'কোনো মিটিং চালু নেই' : 'No Active Session'}
                    </span>
                  )}
                </div>

                {activeMeeting ? (
                  <div className="space-y-6 animate-fade-in">
                    
                    {/* Active Chamber Widget */}
                    <div 
                      className="p-6 rounded-[1.8rem] border flex flex-col justify-between relative overflow-hidden transition-all duration-300"
                      style={{
                        background: isLight 
                          ? 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)' 
                          : 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(4,120,87,0.02) 100%)',
                        borderColor: isLight ? '#bbf7d0' : 'rgba(16,185,129,0.15)'
                      }}
                    >
                      <div>
                        <h4 className={`text-lg md:text-xl font-black ${isLight ? 'text-[#065f46]' : 'text-emerald-400'}`}>
                          {activeMeeting.title}
                        </h4>
                        {activeMeeting.agenda && (
                          <div className="mt-3 bg-white/45 dark:bg-black/25 p-3 rounded-xl border border-emerald-500/10">
                            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-500 flex items-center gap-1">
                              <BookOpen size={11} /> {isBn ? 'মিটিং আলোচ্যসূচি:' : 'Meeting Agenda Points:'}
                            </p>
                            <p className={`text-xs mt-1 font-medium leading-relaxed ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                              {activeMeeting.agenda}
                            </p>
                          </div>
                        )}
                        
                        <p className={`text-xs mt-3 flex items-center gap-1.5 ${isLight ? 'text-slate-650' : 'text-slate-400'}`}>
                          <span>{isBn ? 'মিটিং আহ্বানকারী:' : 'Chamber Host:'}</span>
                          <strong className="text-amber-500 font-extrabold">{activeMeeting.startedBy}</strong>
                          <span className="text-slate-400">•</span>
                          <span>{new Date(activeMeeting.startedAt).toLocaleString(isBn ? 'bn-BD' : 'en-US')}</span>
                        </p>
                      </div>

                      <div className="mt-6 flex flex-wrap gap-2.5">
                        <button
                          onClick={handleJoinSession}
                          className="px-6 py-3.5 rounded-xl text-xs font-black shadow-lg hover:opacity-95 transform hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 cursor-pointer"
                          style={{
                            backgroundColor: themeHex,
                            color: isLightColor(themeHex) ? '#020b06' : '#ffffff'
                          }}
                        >
                          <Play size={14} className="fill-current animate-pulse" />
                          <span>{isBn ? 'মিটিংয়ে জয়েন করুন (লাইভ)' : 'Join Video Chamber'}</span>
                        </button>

                        <button
                          onClick={() => setShowInviteModal(true)}
                          className={`px-4 py-3.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer hover:bg-slate-100 ${isLight ? 'bg-white border-slate-200 text-slate-700' : 'bg-black/35 border-emerald-900/30 text-slate-300'}`}
                        >
                          <Send size={13} className="text-emerald-500" />
                          <span>{isBn ? 'মেম্বারদের আমন্ত্রণ পাঠান' : 'Send Invite'}</span>
                        </button>

                        <button
                          onClick={copyMeetingLink}
                          className={`px-4 py-3.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border cursor-pointer ${isLight ? 'bg-white border-slate-200 text-slate-750' : 'bg-black/20 border-emerald-900/10 text-slate-350'}`}
                        >
                          {copied ? <Check size={14} className="text-[#10b981]" /> : <Copy size={14} />}
                          <span>{copied ? (isBn ? 'লিংক কপিড!' : 'Link Copied!') : (isBn ? 'মিটিং লিংক' : 'Copy URL')}</span>
                        </button>
                      </div>
                    </div>

                    {/* Integrated dynamic real-time attendance logging system */}
                    <div className={`p-5 rounded-3xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-black/25 border-white/[0.04]'}`}>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-2 border-b border-white/[0.05]">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                            <ClipboardList size={14} />
                          </span>
                          <div>
                            <h4 className={`text-xs font-black uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                              {isBn ? 'ভার্চুয়াল হাজিরা খাতা (রিয়েল-টাইম)' : 'Auto Attended Log Sheet'}
                            </h4>
                            <p className="text-[9px] text-slate-400 mt-0.5">
                              {isBn ? 'মিটিংয়ে উপস্থিত হওয়া সদস্যদের সিস্টেম-ট্রেস তালিকা' : 'System generated live metadata of participants currently in-chamber'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          <button
                            onClick={downloadAttendanceCSV}
                            title={isBn ? 'অ্যাটেনডেন্স রিপোর্ট এক্সেল শিটে ডাউনলোড করুন' : 'Export attendance roll to csv format'}
                            className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 flex items-center gap-1 cursor-pointer border border-emerald-500/20 transition-all"
                          >
                            <Download size={11} />
                            <span>{isBn ? 'রিপোর্ট ডাউনলোড' : 'Download Log'}</span>
                          </button>
                          <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0">
                            {isBn ? `উপস্থিতি: ${attendance.length} জন` : `Present: ${attendance.length}`}
                          </span>
                        </div>
                      </div>

                      {attendance.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                          {attendance.map((att) => (
                            <div 
                              key={att.id || att.memberId}
                              className={`p-3 rounded-xl border flex items-center gap-3 transition-colors ${
                                isLight ? 'bg-white border-slate-200' : 'bg-slate-900/40 border-white/[0.03]'
                              }`}
                            >
                              <div className="relative shrink-0 w-8.5 h-8.5 rounded-full overflow-hidden bg-slate-800 flex items-center justify-center border border-white/5">
                                {att.photoURL ? (
                                  <img src={att.photoURL} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-xs font-bold text-amber-500">{att.name.slice(0,2).toUpperCase()}</span>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <h5 className={`text-xs font-black truncate ${isLight ? 'text-slate-850' : 'text-slate-200'}`}>{att.name}</h5>
                                <p className="text-[9px] text-slate-400 font-mono">ID: {att.memberId}</p>
                              </div>
                              <span className={`text-[9px] font-mono shrink-0 flex items-center gap-1 ${isLight ? 'text-slate-650' : 'text-slate-400'}`}>
                                <Clock size={9} />
                                {new Date(att.joinedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-slate-400 text-xs">
                          {isBn ? 'মিটিং রুমে এখন পর্যন্ত কোনো সদস্য জয়েন করেননি।' : 'No members have registered presence in the room yet.'}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="py-12 flex flex-col items-center text-center space-y-4 animate-fade-in">
                    <div className="p-5 rounded-full bg-slate-950/20 text-slate-400 border border-slate-800">
                      <VideoOff size={38} className="stroke-[1.5]" />
                    </div>
                    <div>
                      <h4 className={`text-base font-black ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                        {isBn ? 'বর্তমানে কোনো লাইভ সাধারণ সভা সক্রিয় নেই' : 'No Official Meeting is Currently Active'}
                      </h4>
                      <p className={`text-xs max-w-sm mx-auto mt-1 leading-normal ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {isBn 
                          ? 'সংস্থার প্রশাসক মিটিং কলার প্যানেল থেকে সেশন চালু করলে আপনার ফোনে স্বয়ংক্রিয় সাধারণ নোটিফিকেশন চলে যাবে।' 
                          : 'Admins have not triggered a live voice chamber yet. Keep an eye on scheduled assemblies.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: WhatsApp Invitation & Broadcast System */}
            {activeTab === 'whatsapp_broadcast' && (
              <div 
                className="rounded-[2.2rem] p-6 border relative transition-all duration-300 space-y-6"
                style={{
                  backgroundColor: isLight ? '#ffffff' : 'rgba(2, 14, 8, 0.45)',
                  borderColor: isLight ? '#cbd5e1' : 'rgba(16, 185, 129, 0.15)'
                }}
              >
                {/* Header info */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-dashed border-slate-200 dark:border-white/5 pb-5">
                  <div>
                    <span className="text-[10px] uppercase font-black tracking-widest text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded">
                      🚀 PRO FEATURES • WhatsApp Integration
                    </span>
                    <h3 className={`text-xl font-black mt-2 flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      📢 One-Click WhatsApp Meeting Broadcaster
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 leading-normal max-w-xl">
                      {isBn 
                        ? 'এক ক্লিকে সকল সদস্যের কাছে সভার নোটিশ পাঠান। সভার বিবরণ, সময় এবং मीटिंग লিংক স্বয়ংক্রিয়ভাবে মেসেজে তৈরি হয়ে যাবে।' 
                        : 'Deploy customized invite cards containing link rooms, precise schedules and attendee placeholders directly to WhatsApp.'}
                    </p>
                  </div>
                  
                  {/* Stats badge */}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black px-3.5 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5 shadow-md">
                      <Users size={12} />
                      <span>{isBn ? `মোট সদস্য: ${orgMembers.length} জন` : `Members: ${orgMembers.length}`}</span>
                    </span>
                  </div>
                </div>

                {/* Main Admin Quick Buttons Grid requested by User */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
                  <button
                    type="button"
                    onClick={handleOneClickMeetingCreation}
                    className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 font-black text-xs text-white hover:scale-[1.02] active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-2 shadow-lg shadow-emerald-500/10 cursor-pointer"
                  >
                    <Video size={18} className="animate-pulse" />
                    <span>{isBn ? '🎥 মিটিং তৈরি করুন' : '🎥 Create Meeting'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (!activeMeeting) {
                        alert(isBn ? '⚠️ পূর্বে একটি লাইভ মিটিং বা সেশন চালু করুন!' : '⚠️ Start a live meeting session first!');
                        return;
                      }
                      // Fire sequentially for first
                      if (broadcastRecipients[0]) {
                        handleDispatchWhatsApp(broadcastRecipients[0]);
                      } else {
                        alert(isBn ? 'সদস্য তালিকা খালি!' : 'Recipient list is empty!');
                      }
                    }}
                    className="p-3.5 rounded-2xl bg-emerald-600/10 hover:bg-emerald-600/20 text-[#25D366] font-black text-xs border border-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-2 cursor-pointer"
                  >
                    <MessageSquare size={18} />
                    <span>{isBn ? '📢 WhatsApp Invitation' : '📢 Send Invite'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBroadcastPreset('all');
                      handleResetStatuses();
                      alert(isBn ? '👥 সবাইকে পাঠানোর জন্য সদস্য তালিকা ফিল্টারড সেট করা হয়েছে!' : '👥 Filter preset set to ALL members!');
                    }}
                    className="p-3.5 rounded-2xl bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-400 font-black text-xs border border-indigo-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-2 cursor-pointer"
                  >
                    <Users size={18} />
                    <span>{isBn ? '👥 Send To All' : '👥 Send To All'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setHours(d.getHours() + 1);
                      const tStr = d.toLocaleTimeString(isBn ? 'bn-BD' : 'en-US', { hour: '2-digit', minute: '2-digit' });
                      setMeetingTimeInputText(tStr);
                      alert(isBn ? '⏰ ১ ঘণ্টা পূর্বের সভার রিমাইন্ডার টেক্সট টেমপ্লেটে সেট করা হয়েছে!' : '⏰ 1 Hour Reminder template generated.');
                    }}
                    className="p-3.5 rounded-2xl bg-amber-600/15 hover:bg-amber-600/25 text-amber-400 font-black text-xs border border-amber-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-2 cursor-pointer"
                  >
                    <Clock size={18} />
                    <span>{isBn ? '⏰ ১ ঘণ্টার রিমাইন্ডার' : '⏰ 1-Hr Reminder'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date();
                      d.setMinutes(d.getMinutes() + 15);
                      const tStr = d.toLocaleTimeString(isBn ? 'bn-BD' : 'en-US', { hour: '2-digit', minute: '2-digit' });
                      setMeetingTimeInputText(tStr);
                      alert(isBn ? '⏰ ১৫ মিনিট পূর্বের সভার রিমাইন্ডার টেক্সট টেমপ্লেটে সেট করা হয়েছে!' : '⏰ 15-Min Reminder template generated.');
                    }}
                    className="p-3.5 rounded-2xl bg-rose-600/15 hover:bg-rose-600/25 text-rose-400 font-black text-xs border border-rose-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-2 cursor-pointer"
                  >
                    <Clock size={18} className="animate-bounce" />
                    <span>{isBn ? '⏰ ১৫ মিনিটের রিমাইন্ডার' : '⏰ 15-Min Reminder'}</span>
                  </button>
                </div>

                {/* Sub row of interactive controls */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  
                  {/* Column 1: Filter config & draft template */}
                  <div className="lg:col-span-6 space-y-5">
                    
                    {/* Presets and filters frame */}
                    <div className="bg-black/10 dark:bg-black/25 p-4 rounded-[1.5rem] border border-white/[0.02] space-y-4">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">
                        🎯 সদস্য ফিল্টারিং এবং ব্রডকাস্ট গ্রুপ (Filter Presets)
                      </h4>
                      
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: 'all', labelBn: '👥 সকল সদস্য', labelEn: 'All Members', count: orgMembers.length },
                          { id: 'active', labelBn: '✅ শুধু অ্যাক্টিভ মেম্বার', labelEn: 'Active Only', count: orgMembers.filter(m => m.status === 'active').length },
                          { id: 'due', labelBn: '⚠️ বকেয়া/ডিউ সদস্য', labelEn: 'Due Members Only', count: orgMembers.filter(m => m.totalDue > 0).length },
                          { id: 'branch', labelBn: '📍 শাখা ভিত্তিক', labelEn: 'Branch Wise', count: extractedBranches.length }
                        ].map((p) => {
                          const isSel = selectedBroadcastPreset === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setSelectedBroadcastPreset(p.id as any);
                                handleResetStatuses();
                              }}
                              className={`p-3 rounded-xl border text-[11px] font-black text-left flex flex-col justify-between h-[65px] transition-all cursor-pointer ${
                                isSel
                                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                                  : 'bg-black/10 border-white/[0.02] text-slate-400 hover:bg-black/20 hover:text-slate-300'
                              }`}
                            >
                              <span>{isBn ? p.labelBn : p.labelEn}</span>
                              <span className="text-[10px] font-mono font-bold opacity-80 text-emerald-500">
                                {p.id === 'branch' ? `${p.count}টি শাখা` : `${p.count} জন সদস্য`}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Dropdown if Branch wise selected */}
                      {selectedBroadcastPreset === 'branch' && (
                        <div className="space-y-1.5 animate-fade-in pt-1">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">
                            নির্দিষ্ট জেলা/এলাকা বা শাখা নির্বাচন করুন:
                          </label>
                          <select
                            value={selectedBranch}
                            onChange={(e) => setSelectedBranch(e.target.value)}
                            className="w-full py-2.5 px-3 bg-[#03110b] border border-emerald-900/30 text-white rounded-xl text-xs focus:ring-1 focus:ring-emerald-500"
                          >
                            <option value="all">-- সকল শাখা --</option>
                            {extractedBranches.map((br) => (
                              <option key={br} value={br}>{br}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Live Message template parameter settings */}
                    <div className="bg-black/15 dark:bg-black/25 p-5 rounded-[1.5rem] border border-white/[0.03] space-y-4">
                      <div className="flex items-center gap-1.5">
                        <MessageSquare size={13} className="text-emerald-500" />
                        <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">
                          ✍️ নোটিশের প্যারামিটার এডিটর (Substitute Values)
                        </h4>
                      </div>

                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                              📅 তারিখ (Date Input):
                            </label>
                            <input
                              type="text"
                              value={meetingDateInput}
                              onChange={(e) => setMeetingDateInput(e.target.value)}
                              className="w-full py-2 px-3 bg-black/40 border border-white/[0.05] rounded-xl text-xs text-slate-200"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                              🕗 সময় (Time Input):
                            </label>
                            <input
                              type="text"
                              value={meetingTimeInputText}
                              onChange={(e) => setMeetingTimeInputText(e.target.value)}
                              className="w-full py-2 px-3 bg-black/40 border border-white/[0.05] rounded-xl text-xs text-slate-200"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                            💬 মিটিংয়ের বিষয়/শিরোনাম (Title):
                          </label>
                          <input
                            type="text"
                            value={meetingTitleInputText}
                            onChange={(e) => setMeetingTitleInputText(e.target.value)}
                            className="w-full py-2 px-3 bg-black/40 border border-white/[0.05] rounded-xl text-xs text-slate-250 font-bold"
                          />
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Column 2: Template Preview & Queue Dispatch Board */}
                  <div className="lg:col-span-6 space-y-5">
                    
                    {/* Live Message display */}
                    <div className="bg-emerald-950/5 dark:bg-emerald-950/10 p-5 rounded-[1.5rem] border border-emerald-500/10 space-y-3.5 relative">
                      <div className="flex items-center justify-between pb-2 border-b border-white/[0.04]">
                        <span className="text-[10px] uppercase font-black tracking-widest text-[#25D366] bg-[#25D366]/10 px-2 py-0.5 rounded">
                          📱 হোয়াটসঅ্যাপে যে মেসেজ পাঠানো হবে (Preview)
                        </span>
                        
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(broadcastMessageText);
                            alert(isBn ? 'মেসেজ ক্লিপবোর্ডে কপি করা হয়েছে!' : 'Template copied to clipboard!');
                          }}
                          title="কপি টেক্সট"
                          className="text-xs text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1"
                        >
                          <Copy size={11} />
                          <span>কপি</span>
                        </button>
                      </div>

                      <div className="text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-slate-300 bg-black/30 p-4 rounded-xl max-h-[175px] overflow-y-auto">
                        {broadcastMessageText}
                      </div>

                      <p className="text-[9px] text-emerald-500/75 leading-tight font-medium">
                        💡 এই মেসেজটিতে একটি **সরাসরি জয়েন বাটন** লিংক রয়েছে। যেকোনো মেম্বার এই লিংকে ক্লিক করলেই অ্যাপ ওপেন হবে ও স্বয়ংক্রিয়ভাবে তার উপস্থিতি ট্র্যাক হবে।
                      </p>
                    </div>

                    {/* Recipient queue and tracking */}
                    <div className="bg-black/10 dark:bg-black/25 p-5 rounded-[1.5rem] border border-white/[0.02] space-y-3.5">
                      <div className="flex items-center justify-between pb-1">
                        <div className="flex items-center gap-1.5">
                          <ClipboardList size={13} className="text-emerald-500" />
                          <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 font-bold">
                            📨 প্রসেসিং কিউ ({broadcastRecipients.length} জন)
                          </h4>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleResetStatuses}
                            className="text-[9px] font-black text-rose-400 hover:text-rose-300 uppercase tracking-widest cursor-pointer"
                          >
                            Reset
                          </button>
                        </div>
                      </div>

                      {broadcastRecipients.length > 0 ? (
                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                          {broadcastRecipients.map((rec) => {
                            const status = dispatchStatuses[rec.id] || 'pending';
                            return (
                              <div 
                                key={rec.id}
                                className="p-2.5 rounded-xl bg-black/20 border border-white/[0.01] flex items-center justify-between gap-3 animate-fade-in"
                              >
                                <div className="min-w-0 flex items-center gap-2">
                                  {/* Small status dot */}
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    status === 'sent' ? 'bg-[#25D366]' : status === 'skipped' ? 'bg-rose-400' : 'bg-slate-400'
                                  }`} />

                                  <div className="min-w-0">
                                    <h5 className="text-[11px] font-black truncate text-slate-100">{rec.name}</h5>
                                    <p className="text-[9px] text-slate-400 font-mono">
                                      {rec.phone} • <span className="text-amber-500">{rec.memberId}</span>
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {status !== 'sent' ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleSkipDispatch(rec.id)}
                                        className="py-1 px-2.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[9px] font-black uppercase cursor-pointer"
                                      >
                                        Skip
                                      </button>
                                      
                                      <button
                                        type="button"
                                        onClick={() => handleDispatchWhatsApp(rec)}
                                        className="py-1 px-2.5 rounded bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] text-[9px] font-black uppercase flex items-center gap-1 cursor-pointer"
                                      >
                                        <Share2 size={9} />
                                        <span>Send</span>
                                      </button>
                                    </>
                                  ) : (
                                    <span className="text-[9px] font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1 bg-emerald-500/10 py-1 px-2 rounded">
                                      ✓ SENT
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="py-8 text-center text-slate-400 text-xs">
                          {isBn ? 'এই ক্যাটাগরিতে কিংবা নির্বাচিত শাখায় কোনো সদস্যের তথ্য মেলেনি।' : 'No recipient members found matching chosen presets.'}
                        </div>
                      )}
                    </div>

                  </div>

                </div>

                {/* Live Stats and Attendance graph card */}
                <div className="bg-black/10 dark:bg-black/15 p-5 rounded-[1.5rem] border border-white/[0.03] space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.04] pb-2">
                    <div className="flex items-center gap-1.5">
                      <Trophy size={14} className="text-amber-500 animate-pulse" />
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-350">
                        📊 রিয়েল-টাইম হাজিরা ওভারভিউ ও রিপোর্ট কার্ড
                      </h4>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={downloadAttendanceCSV}
                        className="py-1.5 px-3 rounded-lg text-[10px] bg-emerald-400 hover:bg-emerald-500 text-slate-950 font-black cursor-pointer shadow flex items-center gap-1 translate-y-[-2px]"
                      >
                        <Download size={11} />
                        <span>হাজিরা রিপোর্ট ডাউনলোড করুন</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3.5 rounded-xl bg-black/25 border border-white/[0.02]">
                      <span className="text-[10px] text-slate-400 font-bold block">মোট ব্রডকাস্ট লক্ষ্যগ্রাহক</span>
                      <strong className="text-lg font-mono font-black text-slate-200 block mt-1">{orgMembers.length} জন</strong>
                    </div>

                    <div className="p-3.5 rounded-xl bg-black/25 border border-white/[0.02]">
                      <span className="text-[10px] text-slate-400 font-bold block">মিটিংয়ে বর্তমান উপস্থিত</span>
                      <strong className="text-lg font-mono font-black text-emerald-400 block mt-1">{attendance.length} জন</strong>
                    </div>

                    <div className="p-3.5 rounded-xl bg-black/25 border border-white/[0.02]">
                      <span className="text-[10px] text-slate-400 font-bold block">অনুপস্থিত সাধারণ সদস্য</span>
                      <strong className="text-lg font-mono font-black text-rose-400 block mt-1">
                        {Math.max(0, orgMembers.length - attendance.length)} জন
                      </strong>
                    </div>

                    <div className="p-3.5 rounded-xl bg-black/25 border border-white/[0.02]">
                      <span className="text-[10px] text-slate-400 font-bold block">উপস্থিতির অনুপাত (Attendance Rate)</span>
                      <strong className="text-lg font-mono font-black text-amber-400 block mt-1">
                        {orgMembers.length > 0 ? Math.round((attendance.length / orgMembers.length) * 100) : 0}%
                      </strong>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* TAB CONTENT: Scheduled Meetings */}
            {activeTab === 'schedules' && (
              <div 
                className="rounded-[2.2rem] p-6 border relative transition-all duration-300 space-y-4"
                style={{
                  backgroundColor: isLight ? '#ffffff' : 'rgba(1, 9, 6, 0.6)',
                  borderColor: isLight ? '#cbd5e1' : 'rgba(255,255,255,0.06)'
                }}
              >
                <div className="flex items-center justify-between border-b border-dashed border-slate-200 dark:border-white/5 pb-3">
                  <div>
                    <h3 className={`text-xs font-black uppercase tracking-widest ${isLight ? 'text-slate-700' : 'text-white'}`}>
                      {isBn ? 'সংস্থার তফশিলি সভাসমূহ' : 'Scheduled Assembly Sessions'}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {isBn ? 'আগামীতে অনুষ্ঠিত হতে যাওয়া মিটিংসমূহের শিডিউল খতিয়ান' : 'Calendar records of future monthly block meetings'}
                    </p>
                  </div>
                  
                  {scheduledMeetings.length > 0 && (
                    <span className="text-[10px] font-black px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-400">
                      {isBn ? `মোট: ${scheduledMeetings.length}টি` : `Total: ${scheduledMeetings.length}`}
                    </span>
                  )}
                </div>

                {scheduledMeetings.length > 0 ? (
                  <div className="space-y-4 animate-fade-in">
                    {scheduledMeetings.map((sched) => {
                      const meetTime = new Date(sched.dateTime);
                      const formattedTime = meetTime.toLocaleTimeString(language === 'bn' ? 'bn-BD' : 'en-US', {
                        hour: '2-digit', 
                        minute: '2-digit'
                      });
                      const formattedDate = meetTime.toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                      });

                      const isPast = meetTime.getTime() < Date.now();

                      return (
                        <div 
                          key={sched.id}
                          className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-start justify-between gap-4 transition-colors ${
                            isLight ? 'bg-slate-50 hover:bg-slate-100/70 border-slate-200' : 'bg-black/20 border-white/[0.04] hover:bg-black/35'
                          }`}
                        >
                          <div className="flex items-start gap-3.5">
                            <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400 shrink-0 mt-0.5">
                              <Calendar size={18} />
                            </div>
                            <div className="space-y-1.5 min-w-0">
                              <h4 className={`text-sm font-black truncate leading-tight ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                                {sched.title}
                              </h4>
                              {sched.agenda && (
                                <p className={`text-[11px] font-medium leading-relaxed max-w-lg ${isLight ? 'text-slate-650' : 'text-slate-450'}`}>
                                  {sched.agenda}
                                </p>
                              )}
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-slate-400">
                                <span className="flex items-center gap-1">
                                  <Clock size={10} style={{ color: themeHex }} />
                                  <span className={isPast ? 'text-rose-400 line-through' : ''}>
                                    {formattedDate} • {formattedTime}
                                  </span>
                                </span>
                                <span>•</span>
                                <span>{isBn ? 'তৈরি করেছেন:' : 'Scheduled By:'} <strong className="text-slate-300 font-bold">{sched.createdBy}</strong></span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                            {/* Send WhatsApp Reminder Button (Dynamic 30m Notification text) */}
                            <button
                              onClick={() => sendWhatsAppNotification(sched)}
                              title={isBn ? 'মেম্বারদের হোয়াটস্যাপ নোটিফিকেশন পাঠান' : 'Send WhatsApp 30m alert broadcast notification to group'}
                              className="p-2 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] rounded-xl border border-[#25D366]/20 transition-all cursor-pointer"
                            >
                              <Share2 size={13} />
                            </button>

                            {/* Trigger Live Active Meeting directly from schedule (Admins only) */}
                            {(isAdmin || isModerator) && (
                              <>
                                <button
                                  onClick={() => handleStartFromSchedule(sched)}
                                  title={isBn ? 'এই তফশিলি সভার কল রুম সরাসরি চালু করুন' : 'Launch active conference immediately using this scheduled topic'}
                                  className="px-3 py-2 rounded-xl text-[10px] font-black bg-emerald-500 hover:bg-emerald-600 text-slate-950 transition-all flex items-center gap-1"
                                >
                                  <Play size={10} className="fill-current" />
                                  <span>{isBn ? 'সভা শুরু' : 'Launch Now'}</span>
                                </button>
                                
                                <button
                                  onClick={() => sched.id && handleDeleteSchedule(sched.id)}
                                  title={isBn ? 'তফশিল বাতিল করুন' : 'Cancel scheduled assembly'}
                                  className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all cursor-pointer"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-12 flex flex-col items-center text-center space-y-3">
                    <div className="p-4 rounded-full bg-slate-950/20 text-slate-400 border border-slate-800">
                      <Calendar size={28} className="stroke-[1.5]" />
                    </div>
                    <div>
                      <h4 className={`text-sm font-black ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                        {isBn ? 'কোনো তফশিলি মাসিক সভা নেই' : 'No Future Scheduled Meetings Registered'}
                      </h4>
                      <p className="text-[11px] text-slate-400 max-w-xs mx-auto mt-0.5 leading-normal">
                        {isBn ? 'প্রশাসক প্যানেল থেকে যেকোনো সময় আগামী দিনের সভার দিন ও আলোচ্যসূচি নির্ধারিত করা যাবে।' : 'Admins can use the scheduling window to prepare agenda layouts beforehand.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: Member Rankings Leaderboard */}
            {activeTab === 'rankings' && (
              <div 
                className="rounded-[2.2rem] p-6 border relative transition-all duration-300 space-y-5"
                style={{
                  backgroundColor: isLight ? '#ffffff' : 'rgba(1, 9, 6, 0.6)',
                  borderColor: isLight ? '#cbd5e1' : 'rgba(255,255,255,0.06)'
                }}
              >
                <div className="border-b border-dashed border-slate-200 dark:border-white/5 pb-3">
                  <span className="text-[9px] uppercase font-black tracking-widest text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
                    {isBn ? 'অংশগ্রহণকারী লিডারবোর্ড' : 'Active Member Rankings'}
                  </span>
                  <h3 className={`text-base font-black mt-1 ${isLight ? 'text-slate-800' : 'text-white'}`}>
                    {isBn ? 'সবচেয়ে সক্রিয় সদস্য র‍্যাংকিং (বার্ষিক উপস্থিতি রেকর্ড)' : 'Most Active Member Standings & Trophies'}
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                    {isBn 
                      ? 'ডিজিটাল সাধারণ সভায় যারা সবচেয়ে বেশি মিটিংয়ে সক্রিয়ভাবে উপস্থিত ছিলেন তাদের প্রিমিয়াম র‍্যাংকিং তালিকা।' 
                      : 'Real-time ranking hierarchy indicating the cumulative assembly check-in score log.'}
                  </p>
                </div>

                {rankings.length > 0 ? (
                  <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1 animate-fade-in">
                    {rankings.map((rank, index) => {
                      const isTopThree = index < 3;
                      const getRankBadgeColor = () => {
                        if (index === 0) return 'bg-amber-400 text-slate-950 shadow-md shadow-amber-500/15'; // Gold
                        if (index === 1) return 'bg-slate-300 text-slate-950 shadow-md shadow-slate-300/15'; // Silver
                        if (index === 2) return 'bg-amber-700 text-white shadow-md shadow-amber-800/15'; // Bronze
                        return 'bg-slate-800 text-slate-300 border border-white/5';
                      };

                      return (
                        <div 
                          key={rank.id}
                          className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-colors ${
                            isLight ? 'bg-slate-50 border-slate-200' : 'bg-black/20 border-white/[0.04]'
                          } ${isTopThree && !isLight ? 'bg-emerald-950/5' : ''}`}
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            {/* Rank medallion badge */}
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${getRankBadgeColor()}`}>
                              {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                            </div>

                            {/* Avatar image frame */}
                            <div className="relative shrink-0 w-8.5 h-8.5 rounded-full overflow-hidden bg-slate-800 flex items-center justify-center border border-white/5">
                              {rank.photoURL ? (
                                <img src={rank.photoURL} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-xs font-bold text-amber-500">{rank.name.slice(0, 2).toUpperCase()}</span>
                              )}
                            </div>

                            <div className="min-w-0">
                              <h5 className={`text-xs font-black truncate flex items-center gap-1.5 ${isLight ? 'text-slate-850' : 'text-slate-100'}`}>
                                <span>{rank.name}</span>
                                {index === 0 && <Award size={13} className="text-amber-500 shrink-0" />}
                              </h5>
                              <p className="text-[9px] text-slate-400 font-mono truncate">{rank.email}</p>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="flex items-center gap-1 justify-end">
                              <span className="text-xs font-black text-emerald-400 font-mono">{rank.meetingsAttended}</span>
                              <span className="text-[10px] text-slate-400 font-bold">{isBn ? 'বার' : 'Sessions'}</span>
                            </div>
                            <span className="text-[8px] text-slate-400 block font-mono">
                              {isBn ? 'সর্বশেষ উপস্থিত:' : 'Last Active:'} {new Date(rank.lastAttendedAt).toLocaleDateString(isBn ? 'bn-BD' : 'en-US')}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-400 text-xs">
                    {isBn ? 'মিটিংয়ে এখনো কোনো সদস্য জয়েন করে উপস্থিতি অর্জন করেননি।' : 'No verified member standings loaded yet. Attend meetings to claim rankings.'}
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT: Past Logs & Records */}
            {activeTab === 'history' && (
              <div 
                className="rounded-[2.2rem] p-6 border transition-all duration-300 space-y-4"
                style={{
                  backgroundColor: isLight ? '#ffffff' : 'rgba(1, 9, 6, 0.45)',
                  borderColor: isLight ? '#cbd5e1' : 'rgba(255,255,255,0.03)'
                }}
              >
                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-dashed border-slate-200 dark:border-white/5">
                  <Calendar size={15} style={{ color: themeHex }} />
                  <h3 className={`text-xs font-black uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-white'}`}>
                    {isBn ? 'বিগত মিটিং খসড়া খতিয়ান' : 'Past Assembly History Logs'}
                  </h3>
                </div>

                {history.length > 0 ? (
                  <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1 animate-fade-in">
                    {history.map((hist, idx) => (
                      <div 
                        key={idx}
                        className={`p-3.5 rounded-2xl border flex items-start gap-3 transition-colors ${
                          isLight ? 'bg-slate-50 border-slate-200 hover:bg-slate-100' : 'bg-black/20 border-white/[0.02] hover:bg-black/35'
                        }`}
                      >
                        <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-500 shrink-0 mt-0.5">
                          <Video size={13} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className={`text-xs font-black truncate ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                              {hist.title}
                            </h4>
                            <span className={`text-[9px] font-mono shrink-0 ${isLight ? 'text-slate-600' : 'text-slate-450'}`}>
                              {new Date(hist.startedAt).toLocaleDateString(isBn ? 'bn-BD' : 'en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                          {hist.agenda && (
                            <p className={`text-[10px] mt-1 line-clamp-2 ${isLight ? 'text-slate-650' : 'text-slate-450'}`}>
                              {hist.agenda}
                            </p>
                          )}
                          <p className="text-[9px] font-bold mt-1.5 text-slate-400">
                            {isBn ? 'মিটিং আহ্বানকারী কলার:' : 'Host Anchor:'} <span className="text-amber-500 font-black">{hist.startedBy}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    {isBn ? 'পূর্ববর্তী কোনো মিটিংয়ের ইতিহাস সংরক্ষিত নেই।' : 'No past assembly records found inside historical logs.'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right panel: Admin initiator control center */}
          <div className="lg:col-span-4 space-y-6">
            
            {(isAdmin || isModerator) ? (
              <div 
                className="rounded-[2.2rem] p-6 md:p-8 space-y-5 border transition-all duration-300 shadow-lg"
                style={{
                  backgroundColor: isLight ? '#ffffff' : 'rgba(3, 22, 14, 0.4)',
                  borderColor: isLight ? '#cbd5e1' : 'rgba(16, 185, 129, 0.2)'
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded-md bg-amber-500/10 text-amber-500">
                    <Shield size={16} />
                  </span>
                  <h3 className={`text-xs font-black uppercase tracking-wider ${isLight ? 'text-slate-700' : 'text-white'}`}>
                    {isBn ? 'ভার্চুয়াল অ্যাডমিন নিয়ন্ত্রণকারী' : 'Admin Control Panel'}
                  </h3>
                </div>

                <p className={`text-xs leading-normal ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                  {isBn 
                    ? 'সংস্থার প্রশাসক প্যানেল হিসেবে আপনি এখানে তাৎক্ষণিক সভা কলার চালূ করতে পারেন যা প্রতিটি মেম্বারের ড্যাশবোর্ডে লাইভ চলে যাবে।' 
                    : 'Dispatch Instant Meeting rooms. This automatically populates the Central members lounge with direct interactive triggers.'}
                </p>

                {activeMeeting ? (
                  <div className="space-y-3.5 pt-2">
                    <div className="text-xs bg-slate-950/15 border border-white/[0.03] p-3.5 rounded-xl">
                      <p className="text-emerald-400 font-bold">{isBn ? 'মিটিং রুম বর্তমানে সক্রিয় আছে!' : 'An assembly session is currently online!'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCloseMeeting}
                      disabled={isLoading}
                      className="w-full py-3.5 rounded-xl text-xs font-black bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-950/20 hover:scale-[1.01] transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isLoading ? (
                        <RefreshCw size={14} className="animate-spin text-white" />
                      ) : (
                        <Square size={12} className="fill-current" />
                      )}
                      <span>{isBn ? 'সভাটি সমাপ্ত করুন (End For All)' : 'End Meeting For All'}</span>
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleStartMeeting} className="space-y-4 pt-1">
                    
                    {/* Topic / Subject Input */}
                    <div className="space-y-2">
                      <label className={`block text-[10px] uppercase font-black tracking-widest ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {isBn ? 'মিটিংয়ের বিষয়/শিরোনাম:' : 'Meeting Subject Theme:'}
                      </label>
                      <input
                        type="text"
                        value={meetingTitleInput}
                        required
                        onChange={(e) => setMeetingTitleInput(e.target.value)}
                        placeholder={isBn ? 'যেমন: সাধারণ মাসিক সভা' : 'e.g., General Monthly Block Council'}
                        className={`w-full py-3 px-4 border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors ${
                          isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-black/30 border-emerald-900/30 text-white placeholder-slate-500'
                        }`}
                      />
                    </div>

                    {/* Detailed Agenda Input */}
                    <div className="space-y-2">
                      <label className={`block text-[10px] uppercase font-black tracking-widest ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {isBn ? 'মিটিং আলোচ্য বিষয় (ঐচ্ছিক):' : 'Meeting Agenda (Optional):'}
                      </label>
                      <textarea
                        value={meetingAgendaInput}
                        onChange={(e) => setMeetingAgendaInput(e.target.value)}
                        rows={3}
                        placeholder={isBn ? 'মিটিংয়ের আলোচ্য বিষয়সমূহ...' : 'Define points to discuss in-chamber...'}
                        className={`w-full py-3 px-4 border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors resize-none ${
                          isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-black/30 border-emerald-900/30 text-white placeholder-slate-500'
                        }`}
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isLoading}
                      className="w-full py-3.5 rounded-xl text-xs font-black shadow-md hover:scale-[1.01] transition-all flex items-center justify-center gap-2 cursor-pointer"
                      style={{
                        backgroundColor: themeHex,
                        color: isLightColor(themeHex) ? '#020b06' : '#ffffff'
                      }}
                    >
                      {isLoading ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Video size={14} className="stroke-[2.5]" />
                      )}
                      <span>{isBn ? 'লাইভ মিটিং শুরু করুন (One-Click)' : 'Start Instant Session'}</span>
                    </button>
                  </form>
                )}
              </div>
            ) : null}

            {/* General instruction board card */}
            <div 
              className="rounded-[2.2rem] p-6 border transition-all duration-300"
              style={{
                backgroundColor: isLight ? '#ffffff' : 'rgba(1, 9, 6, 0.4)',
                borderColor: isLight ? '#cbd5e1' : 'rgba(255,255,255,0.03)'
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Shield size={14} className="text-amber-500" />
                <h4 className={`text-xs font-extrabold uppercase tracking-widest ${isLight ? 'text-slate-700' : 'text-amber-500'}`}>
                  {isBn ? 'নিরাপত্তা বিধি ও মডারেটর ক্ষমতা' : 'Security Locks & Controls'}
                </h4>
              </div>
              
              <ul className="space-y-2.5">
                {[
                  {
                    bn: 'মিটিংয়ের নিরাপত্তা শিল্ডে ক্লিক করে পাসকোড বা লবি লক অন করতে পারেন, কোনো মেম্বারকে রিমুভ করার ক্ষমতা কলারের থাকবে।',
                    en: 'Unlock Moderator rules directly in the Jitsi Meet lower pane. Lock rooms, enable passcode locks or remove members instantly.'
                  },
                  {
                    bn: 'মিটিং রেকর্ড করতে ড্যাশবোর্ডের থ্রি-ডট (...) অপশন থেকে রেকর্ডার সেশন ড্রপবক্সে সেভ বা স্ক্রিন রেকর্ড করতে পারেন।',
                    en: 'Launch high-fidelity meeting recording via Dropbox storage link inside the Jitsi context pane.'
                  },
                  {
                    bn: 'লবি থেকে ডিরেক্ট হাজিরা শিট CSV বা এক্সেল ফাইলে এবং বার্ষিক উপস্থিতি মেম্বার প্রোফাইলে অটো-সিঙ্ক হয়ে যাবে।',
                    en: 'Auto mark system auto-syncs attendance scores straight to the gamified standings and printable CSV sheets.'
                  }
                ].map((item, idx) => (
                  <li key={idx} className="flex gap-2 text-xs leading-normal">
                    <span className="text-emerald-500 shrink-0 mt-0.5">✔</span>
                    <span className={isLight ? 'text-slate-650' : 'text-slate-350'}>{isBn ? item.bn : item.en}</span>
                  </li>
                ))}
              </ul>
            </div>

          </div>

        </div>
      ) : (
        /* Inside active embed sandbox frame view occupied space - ZOOM STYLE FULLSCREEN CALL */
        <div className="space-y-4 animate-fade-in">
          
          <div className="flex flex-wrap items-center justify-between gap-3 bg-black/40 border border-white/5 p-4 rounded-3xl">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsJoined(false)}
                className="p-2.5 rounded-xl hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title={isBn ? 'ড্যাশবোর্ডে ফিরে যান' : 'Go back to lobby'}
              >
                <ArrowLeft size={16} />
              </button>
              
              <div>
                <h4 className="text-sm font-black text-white flex items-center gap-2">
                  <span className="relative flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  {activeMeeting?.title}
                </h4>
                <p className="text-[10px] text-slate-400">{isBn ? 'সুরক্ষিত ডিজিটাল সংযোগ সক্রিয় রয়েছে' : 'Secure interactive virtual panel active'}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowInviteModal(true)}
                className="px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 border border-emerald-500/20 cursor-pointer"
              >
                <Send size={12} />
                <span>{isBn ? 'ইনভাইট কার্ড' : 'Invite Cards'}</span>
              </button>

              <button
                onClick={toggleFullscreen}
                className="px-4 py-2.5 bg-white/10 hover:bg-white/15 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Maximize2 size={13} />
                <span>{isBn ? 'ফুল স্ক্রিন' : 'Fullscreen'}</span>
              </button>

              <button
                onClick={() => setIsJoined(false)}
                className="px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-black transition-all cursor-pointer"
              >
                {isBn ? 'সংযোগ বিচ্ছিন্ন করুন' : 'Disconnect'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            
            {/* Left Column: Secure Video iframe panel - Zoom / Google Meet Style Frame */}
            <div className="lg:col-span-8 aspect-video w-full rounded-[2.2rem] border-2 border-emerald-500/10 overflow-hidden bg-black relative shadow-2xl min-h-[500px]">
              <iframe
                id="jitsi-meeting-iframe"
                src={getEmbedMeetingUrl()}
                allow="camera; microphone; display-capture; autoplay; clipboard-write"
                className="w-full h-full border-0 animate-fade-in"
                style={{ minHeight: '520px' }}
                title="Secure Video Chamber"
              />
            </div>

            {/* Right Column: Smart Spotlight Monitor, active decibel wave equalizer */}
            <div 
              className="lg:col-span-4 rounded-[2.2rem] border p-6 flex flex-col justify-between space-y-6 transition-all duration-300"
              style={{
                backgroundColor: isLight ? '#ffffff' : 'rgba(1, 9, 6, 0.45)',
                borderColor: isLight ? '#cbd5e1' : 'rgba(255, 255, 255, 0.05)',
                boxShadow: '0 4px 20px -2px rgba(0,0,0,0.1)'
              }}
            >
              <div className="space-y-5">
                {/* Header info */}
                <div>
                  <span className="text-[9px] uppercase font-black tracking-widest text-[#10b981] bg-emerald-500/10 px-2 py-0.5 rounded">
                    {isBn ? 'স্মার্ট স্পিকার ডিরেক্টর' : 'Smart Voice Director'}
                  </span>
                  <h4 className={`text-sm font-black mt-1 ${isLight ? 'text-slate-800' : 'text-slate-150'}`}>
                    {isBn ? 'অ্যাক্টিভ স্পিকার স্পটলাইট' : 'Active Speaker Spotlight'}
                  </h4>
                  <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                    {isBn 
                      ? 'ভিডিওর ভেতরে কে কথা বলছেন তা রিয়েল-টাইমে মাইক্রোফোন তরঙ্গে সনাক্ত করুন।'
                      : 'Automatically calculate and focus whoever is actively speaking inside the conference.'}
                  </p>
                </div>

                {/* Direct layout modes controller buttons */}
                <div className="space-y-2">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    {isBn ? 'ক্যামেরা লেআউট ফোকাস মোড:' : 'Layout Focus Mode:'}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Active Speaker Spotlight Button Option */}
                    <button
                      type="button"
                      onClick={() => setIsSpeakerFocus(true)}
                      className={`p-3 rounded-xl border text-[11px] font-black flex flex-col items-center justify-center gap-1.5 transition-all text-center cursor-pointer ${
                        isSpeakerFocus
                          ? isLight 
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-800' 
                            : 'bg-emerald-950/30 border-emerald-500/60 text-emerald-400 shadow-md shadow-emerald-950/20'
                          : isLight 
                            ? 'bg-slate-50 border-slate-200 text-slate-650 hover:bg-slate-100' 
                            : 'bg-black/20 border-white/[0.02] text-slate-400 hover:bg-black/35 hover:text-slate-200'
                      }`}
                    >
                      <Volume2 size={15} className={isSpeakerFocus ? 'animate-bounce' : ''} />
                      <span>{isBn ? 'স্পিকার স্পটলাইট' : 'Speaker Spotlight'}</span>
                    </button>

                    {/* Standard Grid Button Option */}
                    <button
                      type="button"
                      onClick={() => setIsSpeakerFocus(false)}
                      className={`p-3 rounded-xl border text-[11px] font-black flex flex-col items-center justify-center gap-1.5 transition-all text-center cursor-pointer ${
                        !isSpeakerFocus
                          ? isLight 
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-800' 
                            : 'bg-emerald-950/30 border-emerald-500/60 text-emerald-400 shadow-md shadow-emerald-950/20'
                          : isLight 
                            ? 'bg-slate-50 border-slate-200 text-slate-650 hover:bg-slate-100' 
                            : 'bg-black/20 border-white/[0.02] text-slate-400 hover:bg-black/35 hover:text-slate-200'
                      }`}
                    >
                      <LayoutGrid size={15} />
                      <span>{isBn ? 'গ্রিড ভিউ লেআউট' : 'Grid View layout'}</span>
                    </button>
                  </div>
                  <p className="text-[9px] text-[#10b981] font-medium leading-tight pt-1">
                    {isSpeakerFocus 
                      ? (isBn ? '💡 স্পটলাইট সক্রিয়: যে কথা বলবে তার ভিডিও স্বয়ংক্রিয়ভাবে স্ক্রিনের মাঝে বড় হয়ে প্রদর্শন করবে।' : '💡 Spotlight active: Jitsi auto-enlarges whoever is currently speaking.')
                      : (isBn ? '💡 গ্রিড সক্রিয়: সকল সদস্যদের ভিডিও টাইলস সমান মাপে গ্রিড আকারে প্রদর্শিত হবে।' : '💡 Grid active: All member tiles are formatted with equal spacing.')}
                  </p>
                </div>

                {/* Local user real-time microphone indicator tile */}
                <div 
                  className={`p-4 rounded-2.5xl border transition-all duration-300 ${
                    isSpeaking 
                      ? 'border-emerald-500/50 bg-[#10b981]/[0.03] shadow-lg shadow-emerald-950/10' 
                      : 'border-white/[0.03] bg-black/10'
                  }`}
                  style={isSpeaking && isLight ? { borderColor: themeHex, backgroundColor: `${themeHex}08` } : {}}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      {isBn ? 'আপনার অডিও ইনপুট' : 'Your Live Endpoint voice'}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isSpeaking ? 'bg-emerald-500' : 'bg-slate-450'}`}></span>
                        <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isSpeaking ? 'bg-emerald-500' : 'bg-slate-450'}`}></span>
                      </span>
                      <span className={`text-[9px] font-bold uppercase tracking-wider ${isSpeaking ? 'text-[#10b981]' : 'text-slate-400'}`}>
                        {isSpeaking ? (isBn ? 'কথা বলছেন' : 'Speaking') : (isBn ? 'নীরব' : 'Quiet')}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-3.5">
                    {/* User Profile Avatar / Frame */}
                    <div className={`relative shrink-0 w-10 h-10 rounded-full flex items-center justify-center overflow-hidden border-2 transition-all ${
                      isSpeaking ? 'border-emerald-500 shadow-md scale-105' : 'border-white/[0.05]'
                    }`}>
                      {user?.photoURL ? (
                        <img src={user.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full bg-slate-800 text-amber-500 font-black text-xs flex items-center justify-center">
                          {user?.displayName?.slice(0, 2).toUpperCase() || 'ME'}
                        </div>
                      )}
                      
                      {isSpeaking && (
                        <span className="absolute inset-0 bg-[#10b981]/25 animate-ping rounded-full pointer-events-none" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h5 className={`text-xs font-black truncate ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                        {user?.displayName || 'Anonymous Member'}
                      </h5>
                      <span className="text-[9px] text-slate-400 font-mono mt-0.5 block truncate">
                        ID: {user?.email?.split('@')[0].toUpperCase() || 'MEMBER'}
                      </span>
                    </div>

                    {/* Dynamic Equalizer Wave pattern */}
                    <div className="flex items-center gap-0.5 h- 5 shrink-0 px-2">
                      {[0.4, 0.7, 1.0, 0.8, 0.5, 0.9, 0.3].map((multiplier, i) => {
                        const rawScale = isSpeaking ? (micVolume / 35) * multiplier : 0.15;
                        const scale = Math.min(1.2, Math.max(0.15, rawScale));
                        return (
                          <span 
                            key={i} 
                            className="w-0.5 bg-[#10b981] rounded-full transition-transform duration-75 origin-bottom"
                            style={{ 
                              height: '16px', 
                              transform: `scaleY(${scale})` 
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {micError ? (
                    <div className="mt-2.5 flex items-center gap-1.5 text-[9px] text-rose-400 bg-rose-500/10 p-2 rounded-xl">
                      <MicOff size={10} />
                      <span className="font-semibold text-[8px]">{isBn ? 'মাইক্রোফোনের অনুমতি প্রদান করুন' : 'Microphone audio context locked'}</span>
                    </div>
                  ) : (
                    <div className="mt-2.5 flex items-center justify-between text-[9px] text-slate-400 bg-black/25 p-2 rounded-xl border border-white/[0.02]">
                      <span className="flex items-center gap-1">
                        <Mic size={9} className="text-emerald-500" />
                        <span>{isBn ? 'ডেসিবেল পাওয়ার মিটার:' : 'Sound Decibel Wave:'}</span>
                      </span>
                      <span className="font-mono text-emerald-400 font-black">{micVolume} dB</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Instructions and tips */}
              <div className={`p-4 rounded-2.5xl border text-[10px] leading-relaxed space-y-2 font-medium ${
                isLight ? 'bg-slate-50 text-slate-700 border-slate-200' : 'bg-black/10 text-slate-350 border-white/[0.02]'
              }`}>
                <div className="flex items-center gap-1 text-emerald-500">
                  <Sparkles size={11} className="shrink-0" />
                  <span className="font-black uppercase tracking-wider">{isBn ? 'স্পিকার ডিরেক্ট নির্দেশিকা' : 'How Speakers are Featured'}</span>
                </div>
                <p>
                  {isBn 
                    ? '১. আপনি কথা বললে মাইক্রোফোন আপনার গলার ওয়েভফ্রিকোয়েন্সি ট্র্যাক করে রিয়েলটাইমে কথা বলার সংকেত দেখাবে।' 
                    : '1. Live speaker detection monitors browser frequency amplitude in real-time.'}
                </p>
                <p>
                  {isBn
                    ? '২. সর্বোত্তম স্পটলাইট ফোকাসের জন্য Jitsi স্ক্রিনের নিচের থ্রি-ডট (...) মেনু থেকে "Tile View" বন্ধ করে দিন।'
                    : '2. Disable Tile View in Jitsi (...) menu to allow the director to auto-zoom on speaking candidates.'}
                </p>
              </div>

            </div>

          </div>

        </div>
      )}

      {/* Invitation Card Modal overlay */}
      {showInviteModal && activeMeeting && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div 
            className="w-full max-w-lg rounded-[2rem] overflow-hidden shadow-2xl relative border outline-none animate-scale-up"
            style={{
              backgroundColor: isLight ? '#ffffff' : '#031c11',
              borderColor: isLight ? '#cbd5e1' : 'rgba(16, 185, 129, 0.25)'
            }}
          >
            <div className="absolute top-0 inset-x-0 h-[3px]" style={{ backgroundColor: themeHex }} />
            
            <div className="p-6 md:p-8 space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-dashed border-slate-200 dark:border-white/5">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                    <Send size={15} />
                  </span>
                  <div>
                    <h3 className={`text-base font-black ${isLight ? 'text-slate-850' : 'text-slate-100'}`}>
                      {isBn ? 'ইনভাইট কার্ড ও মেসেজ নোটিশ' : 'Create Invitation Card'}
                    </h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {isBn ? 'হোয়াটস্যাপ এবং মেসেঞ্জারে শেয়ার করার উপযোগী টেক্সট' : 'Formatted direct templates for social application groups'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Message Draft visual */}
              <div className={`p-4 rounded-2xl border text-xs leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap font-medium ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-750' : 'bg-black/35 border-emerald-900/30 text-slate-300'
              }`}>
                {getShareTemplateText()}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={copyInviteMessage}
                  className="flex-1 py-3.5 rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all hover:opacity-95"
                  style={{
                    backgroundColor: themeHex,
                    color: isLightColor(themeHex) ? '#020b06' : '#ffffff'
                  }}
                >
                  {inviteCopied ? <Check size={14} /> : <Copy size={14} />}
                  <span>{inviteCopied ? (isBn ? 'আমন্ত্রণ নোটিশ কপিড!' : 'Copied Invitation!') : (isBn ? 'কপি করুন এবং মেম্বারদের পাঠান' : 'Copy Broadcast')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const encodedInvite = encodeURIComponent(getShareTemplateText());
                    window.open(`https://api.whatsapp.com/send?text=${encodedInvite}`, '_blank');
                  }}
                  className="px-4 py-3.5 border rounded-xl text-xs font-extrabold bg-[#25D366] hover:bg-[#20ba5a] text-slate-950 cursor-pointer transition-colors border-none"
                >
                  WhatsApp
                </button>

                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className={`px-4 py-3.5 border rounded-xl text-xs font-extrabold cursor-pointer transition-colors ${
                    isLight ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700' : 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-350'
                  }`}
                >
                  {isBn ? 'বন্ধ করুন' : 'Dismiss'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW FEATURE: Schedule Meeting Creator Modal View */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div 
            className="w-full max-w-md rounded-[2.2rem] overflow-hidden shadow-2xl relative border outline-none animate-scale-up"
            style={{
              backgroundColor: isLight ? '#ffffff' : '#03110b',
              borderColor: isLight ? '#cbd5e1' : 'rgba(16, 185, 129, 0.25)'
            }}
          >
            <div className="absolute top-0 inset-x-0 h-[3px]" style={{ backgroundColor: themeHex }} />
            
            <form onSubmit={handleScheduleSubmit} className="p-6 md:p-8 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-dashed border-slate-200 dark:border-white/5">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                    <Calendar size={16} />
                  </span>
                  <div>
                    <h3 className={`text-sm font-black ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                      {isBn ? 'নতুন সভা নির্ধারণ / সেডিউল' : 'Schedule Future Assembly'}
                    </h3>
                    <p className="text-[10px] text-slate-450 mt-0.5">
                      {isBn ? 'ভবিষ্যতের সভার বিষয়বস্তু এবং সময় নির্ধারণ করুন' : 'Set topics, dates and invite members beforehand'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="p-1.5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Title Input */}
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase font-black tracking-widest text-slate-400">
                  {isBn ? 'সভার শিরোনাম / বিষয়:' : 'Assembly Topic:'}
                </label>
                <input
                  type="text"
                  value={scheduleTitle}
                  required
                  onChange={(e) => setScheduleTitle(e.target.value)}
                  placeholder={isBn ? 'যেমন: সাধারণ মাসিক কার্যনির্বাহী সভা' : 'e.g., General Executive Body Convocation'}
                  className={`w-full py-2.5 px-3 border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors ${
                    isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-black/35 border-emerald-950/30 text-white'
                  }`}
                />
              </div>

              {/* Agenda / Details */}
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase font-black tracking-widest text-slate-400">
                  {isBn ? 'আলোচ্যসূচি খসড়া (ঐচ্ছিক):' : 'Meeting Agenda & Discuss points:'}
                </label>
                <textarea
                  value={scheduleAgenda}
                  onChange={(e) => setScheduleAgenda(e.target.value)}
                  rows={2}
                  placeholder={isBn ? 'আলোচ্য সূচি ১, সূচি ২...' : 'Write notes or reference agendas here...'}
                  className={`w-full py-2.5 px-3 border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors resize-none ${
                    isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-black/35 border-emerald-950/30 text-white'
                  }`}
                />
              </div>

              {/* Date & Time Picker */}
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase font-black tracking-widest text-slate-400">
                  {isBn ? 'সভার সময় ও তারিখ:' : 'Scheduled Date & Time:'}
                </label>
                <input
                  type="datetime-local"
                  value={scheduleDateTime}
                  required
                  onChange={(e) => setScheduleDateTime(e.target.value)}
                  className={`w-full py-2.5 px-3 border rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-colors ${
                    isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-black/35 border-emerald-950/30 text-white text-slate-300'
                  }`}
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 py-3 rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all hover:opacity-95"
                  style={{
                    backgroundColor: themeHex,
                    color: isLightColor(themeHex) ? '#020b06' : '#ffffff'
                  }}
                >
                  {isLoading ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={13} />}
                  <span>{isBn ? 'তফশিল চূড়ান্ত করুন' : 'Confirm & Schedule'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className={`px-4 py-3 border rounded-xl text-xs font-extrabold cursor-pointer transition-colors ${
                    isLight ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700' : 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-350'
                  }`}
                >
                  {isBn ? 'বাতিল' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
