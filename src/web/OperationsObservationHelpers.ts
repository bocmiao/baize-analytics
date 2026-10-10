import {useEffect,useState} from 'react';
import {api} from './api';
import {language} from './i18n';
export const operationsLabel=(zh:string,en:string)=>language()==='en'?en:zh;
export function useOperationsRead<T>(url:string,refresh=0){const [data,setData]=useState<T|null>(null),[error,setError]=useState('');useEffect(()=>{const controller=new AbortController();setData(null);setError('');void api<T>(url,undefined,'GET',controller.signal).then(setData).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[url,refresh]);return {data,error};}
