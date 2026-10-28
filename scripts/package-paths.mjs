import path from 'node:path';

// Release manifests and tar entries always use POSIX paths, including on Windows.
export const releasePath=(root,file,pathApi=path)=>pathApi.relative(root,file).split(pathApi.sep).join('/');
export const within=(file,parent,pathApi=path)=>{
 const relative=pathApi.relative(parent,file);
 return relative===''||(!pathApi.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+pathApi.sep));
};
