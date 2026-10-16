// Explicit mock observations; these are not scores produced by a vision model.
export function qualityCriteria() {
  const criteria = Object.fromEntries([
    ["subject",10],["object",5],["relation",5],
    ["anatomy",4],["frame",4],["wheels",4],["support",4],["pedal",8],["control",6],
    ["proportion",8],["posture",8],["integration",4],["composition",5],["coherence",10],
  ].map(([key,score])=>[key,{score,evidence:"测试夹具：对应部位的可见依据"}]));
  for (const [key,from,to] of [["support","腹部下缘","座垫上表面"],["pedal","脚底","曲柄连接的踏板面"],["control","翅膀末端","车把握持处"]]) {
    Object.assign(criteria[key], { connection:"verified", from, to });
  }
  return criteria;
}

export function fullQualityCriteria() {
  const criteria = qualityCriteria();
  for (const key of ["subject","pedal","control","proportion","posture","coherence"]) criteria[key].score = 10;
  for (const key of ["object","relation","anatomy","frame","wheels","support","integration","composition"]) criteria[key].score = 5;
  return criteria;
}
