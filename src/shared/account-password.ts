import {z} from 'zod';
/** Account password compatibility uses JavaScript string length, without truncation. */
export const accountPasswordSchema=z.string().min(12).max(1024).refine(value=>new TextEncoder().encode(value).byteLength<=4096,{message:'Password exceeds 4096 UTF-8 bytes'});
