// Hand-authored sRGB pigment studies; convert to linear RGB before interpolation.
export const studies=[["Cobalt",["#121a36","#283d85","#4287aa","#9adbdc","#e5ecdf"]],["Petrol",["#160d2c","#48348b","#197c82","#88bb9a","#f5ba6b"]],["Verdigris",["#111d2a","#1b5663","#4fa29b","#cc7547","#f4d6a0"]],["Iris",["#1b1031","#463d9c","#8563cb","#e299bc","#f7dfec"]],["Ice",["#102734","#285a76","#50a0b9","#a9d8dd","#eaf6ef"]],["Brass",["#151b21","#49534d","#9e7b43","#e7bd72","#f6e7c7"]],["Prism",["#3d1b7d","#2167c9","#2ebcbd","#a9c83d","#f1a145"]],["Lime",["#25153f","#235e80","#36a69b","#c1d950","#ebd49a"]],["Copper",["#241630","#6a326d","#b74f65","#e38f58","#f6d9ac"]]];
export const paletteNames=studies.map(p=>p[0]);
export function linearHex(hex){return [1,3,5].map(i=>{const v=parseInt(hex.slice(i,i+2),16)/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});}
export const paletteStops=studies.map(([,colors])=>colors.map(linearHex));
