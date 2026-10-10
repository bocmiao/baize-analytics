import {z} from 'zod';
export const botWindowSchema=z.object({from:z.iso.date(),to:z.iso.date()}).strict().refine(x=>x.from<=x.to&&Date.parse(x.to)-Date.parse(x.from)<=30*86400000,'At most31 calendar days');
export const annotationSchema=z.object({date:z.iso.date(),title:z.string().trim().min(1).max(120),note:z.string().max(2000).default('')}).strict();
export const annotationWindowSchema=z.object({from:z.iso.date(),to:z.iso.date()}).strict().refine(x=>x.from<=x.to&&Date.parse(x.to)-Date.parse(x.from)<=365*86400000,'At most366 calendar days');
export type SiteAnnotation=z.infer<typeof annotationSchema>&{id:string;timezone:string;created_at?:string;updated_at?:string};
