import { readFileSync, writeFileSync } from "node:fs";
const o=JSON.parse(readFileSync("/private/tmp/claude-501/-Users-omsawant-Desktop-data/c708e804-8c02-41a3-9f30-d3c6f004dcfc/tasks/w2xynm1py.output","utf8"));
const data=o.result;
const gen=JSON.parse(readFileSync("data/generated.json","utf8"));
const idx={}; gen.content.forEach((e,i)=>idx[e.app+"|||"+e.category]=i);
function upsert(app,cat,ratings){
  const k=app+"|||"+cat;
  if(idx[k]!=null){ const e=gen.content[idx[k]]; e.ratings=e.ratings||{}; Object.assign(e.ratings, ratings); }
  else { gen.content.push({app, category:cat, ratings}); idx[k]=gen.content.length-1; }
}
let n=0;
for(const a of data){
  const ratings={};
  for(const r of a.ratings){ ratings[r.criterion]=[r.score, r.verdict]; n++; }
  upsert(a.app, "Browser", ratings);
}
// Calendar: Google Calendar / Purposeful Design = 3
upsert("Google Calendar","Calendar",{"Purposeful Design":[3,"Google Calendar's interface is functional and familiar, but its design feels utilitarian and dated next to modern calendars, lacking the intentional polish and craft that newer apps bring."]});
n++;
writeFileSync("data/generated.json", JSON.stringify(gen,null,2));
console.log("verdicts merged:", n);
