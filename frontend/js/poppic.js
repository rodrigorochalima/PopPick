export function computePoppicAverage(eventsForContent){
  const scored=eventsForContent.filter(e=>typeof e.score==='number');
  if(!scored.length) return null;
  const avg=scored.reduce((a,b)=>a+b.score,0)/scored.length;
  return +avg.toFixed(1);
}
