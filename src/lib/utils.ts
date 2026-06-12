/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export function getImageUrl(url?: string): string | undefined {
  if (!url) return undefined;

  // Handle Google Drive links
  // Convert https://drive.google.com/file/d/ID/view?usp=sharing
  // to https://lh3.googleusercontent.com/d/ID
  const gdMatch = url.match(/drive\.google\.com\/file\/d\/([^\/]+)/);
  if (gdMatch && gdMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${gdMatch[1]}`;
  }

  const gdUcMatch = url.match(/drive\.google\.com\/uc\?id=([^\&]+)/);
  if (gdUcMatch && gdUcMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${gdUcMatch[1]}`;
  }

  // Handle Dropbox links
  if (url.includes('dropbox.com')) {
    return url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace('?dl=0', '').replace('?dl=1', '');
  }

  return url;
}

/**
 * Pre-fetches and sanitizes all link stylesheets on the current page.
 * Returns an array of objects containing the original href and the sanitized CSS text content.
 * Cleans modern colors like oklch to ensure html2canvas never crashes.
 */
export async function getSanitizedStylesheets(): Promise<{ href: string; text: string }[]> {
  const styleLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
  const stylePromises = styleLinks.map(async (link) => {
    try {
      const href = (link as HTMLLinkElement).href;
      if (!href) return null;
      const res = await fetch(href);
      if (!res.ok) return null;
      const text = await res.text();
      const cleanText = cleanCssText(text);
      return { href, text: cleanText };
    } catch (e) {
      console.warn('Failed to pre-fetch stylesheet:', e);
      return null;
    }
  });
  const results = await Promise.all(stylePromises);
  return results.filter((r): r is { href: string; text: string } => r !== null);
}

/**
 * Scans CSS text or style attributes and replaces unsupported modern color functions
 * (oklch, oklab, color-mix, color, hwb, lab, lch) with safe CSS Level 3 fallback RGB/RGBA colors.
 * Utilizes a parenthesis-matching state machine to correctly extract nested expressions (e.g. from var() or calc()).
 */
export function cleanCssText(text: string): string {
  if (typeof text !== 'string') return text;
  
  const keywords = ['oklch(', 'oklab(', 'color-mix(', 'color(', 'hwb(', 'lab(', 'lch('];
  let result = '';
  let i = 0;
  
  while (i < text.length) {
    let foundKeyword = '';
    for (const kw of keywords) {
      if (text.substring(i, i + kw.length).toLowerCase() === kw) {
        foundKeyword = kw;
        break;
      }
    }
    
    if (foundKeyword) {
      let parenCount = 1;
      let j = i + foundKeyword.length;
      while (j < text.length && parenCount > 0) {
        if (text[j] === '(') parenCount++;
        else if (text[j] === ')') parenCount--;
        j++;
      }
      
      const fullExpr = text.substring(i, j);
      const exprLower = fullExpr.toLowerCase();
      
      // Determine a smart fallback color depending on keywords and opacity
      let alpha = '1';
      if (exprLower.includes('transparent')) {
        alpha = '0.05'; // Default to a very faint opacity if we mix with transparent
        const pctMatch = fullExpr.match(/(\d+)%/);
        if (pctMatch && pctMatch[1]) {
          alpha = String(parseFloat(pctMatch[1]) / 100);
        }
      } else {
        // Look for alpha inside like "/ 0.5" or "/ 50%" or ", 0.5"
        const alphaMatch = fullExpr.match(/[\/\s,]\s*([\d.]+%?)\s*\)?$/) || fullExpr.match(/\/[\s]*([\d.]+%?)/);
        if (alphaMatch && alphaMatch[1]) {
          let alphaVal = alphaMatch[1].trim();
          if (alphaVal.endsWith('%')) {
            alpha = String(parseFloat(alphaVal) / 100);
          } else {
            alpha = alphaVal;
          }
        }
      }
      
      let replacement = `rgba(16, 185, 129, ${alpha})`; // default to emerald green
      
      if (exprLower.includes('rose') || exprLower.includes('red') || exprLower.includes('ef4444') || exprLower.includes('f87171')) {
        replacement = `rgba(244, 63, 94, ${alpha})`;
      } else if (exprLower.includes('amber') || exprLower.includes('yellow') || exprLower.includes('f59e0b') || exprLower.includes('eab308')) {
        replacement = `rgba(245, 158, 11, ${alpha})`;
      } else if (exprLower.includes('white') || exprLower.includes('#fff') || exprLower.includes('ffffff') || exprLower.includes('1 0 0') || exprLower.includes('255, 255, 255')) {
        replacement = `rgba(255, 255, 255, ${alpha})`;
      } else if (exprLower.includes('slate') || exprLower.includes('gray') || exprLower.includes('black') || exprLower.includes('#000') || exprLower.includes('0 0 0') || exprLower.includes('15, 23, 42') || exprLower.includes('09090b') || exprLower.includes('020202')) {
        replacement = `rgba(15, 23, 42, ${alpha})`;
      } else if (exprLower.includes('transparent')) {
        replacement = `rgba(0, 0, 0, 0)`;
      } else if (exprLower.includes('sky') || exprLower.includes('blue') || exprLower.includes('3b82f6') || exprLower.includes('0284c7')) {
        replacement = `rgba(59, 130, 246, ${alpha})`;
      }
      
      result += replacement;
      i = j;
    } else {
      result += text[i];
      i++;
    }
  }
  
  return result;
}

