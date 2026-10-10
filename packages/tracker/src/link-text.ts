/** MIT License. Copyright (c) Baize contributors. */
/** Minimization only: arbitrary business text cannot be proved anonymous. */
export function publicLinkText(text:string):string {
 return Array.from(text.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g,'[redacted]').replace(/\+?\d[\d\s().-]{5,}\d/g,'[redacted]').replace(/(?:[a-f\d]{0,4}:){3,}[a-f\d:]+/gi,'[redacted]').replace(/\s+/g,' ').trim()).slice(0,50).join('');
}
