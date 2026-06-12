/**
 * WhatsApp Business API & Link Dispather Service Module
 * Naछিরেরটেক সমাজ কল্যাণ সংস্থা (NSWO) Society management App
 */

export interface WhatsAppPayload {
  to: string;
  text: string;
  templateName?: string;
  templateLang?: string;
  templateParams?: string[];
}

export interface WhatsAppSendResponse {
  success: boolean;
  message: string;
  mode: 'api' | 'fallback' | 'error';
  errorDetail?: string;
}

/**
 * Clean phone number to WhatsApp compatible E.164 format (specifically formatted for Bangladesh numbers if needed)
 */
export function formatWhatsAppNumber(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, '');
  if (!cleaned) return '';

  // Handle local Bangladeshi number patterns
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    return `88${cleaned}`;
  }
  if (cleaned.startsWith('880') && cleaned.length === 13) {
    return cleaned;
  }
  if (cleaned.length === 10 && !cleaned.startsWith('0')) {
    return `880${cleaned}`;
  }
  return cleaned;
}

/**
 * Automate sending messages via Server-Side WhatsApp Business Cloud API.
 * If server returns not-configured or fallback code, it triggers a browser popup fallback safely.
 */
export async function sendWhatsAppMessage(payload: WhatsAppPayload): Promise<WhatsAppSendResponse> {
  const cleanTo = formatWhatsAppNumber(payload.to);
  if (!cleanTo) {
    return {
      success: false,
      mode: 'error',
      message: 'Invalid recipient phone number format'
    };
  }

  const normalizedPayload: WhatsAppPayload = {
    ...payload,
    to: cleanTo
  };

  try {
    const res = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(normalizedPayload)
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} response from server proxy`);
    }

    const data = await res.json();
    return {
      success: !!data.success,
      message: data.message || 'Transmission dispatched successfully',
      mode: data.mode || 'api',
      errorDetail: data.error
    };
  } catch (err: any) {
    console.error('[WhatsApp Service] Auto dispatch failed. Returning browser fallback:', err);
    return {
      success: false,
      mode: 'fallback',
      message: 'Server-side API failed. Preparing browser fallback...',
      errorDetail: err?.message || String(err)
    };
  }
}

/**
 * Launch fallback manual interactive WhatsApp message
 */
export function triggerManualWhatsAppRedirect(phone: string, text: string): void {
  const cleanTo = formatWhatsAppNumber(phone);
  const encodedText = encodeURIComponent(text);
  const targetUrl = `https://api.whatsapp.com/send?phone=${cleanTo}&text=${encodedText}`;
  window.open(targetUrl, '_blank');
}
