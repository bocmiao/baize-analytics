export function ownValue<T>(dictionary:Record<string,T>,key:string):T|undefined{return Object.hasOwn(dictionary,key)?dictionary[key]:undefined;}
