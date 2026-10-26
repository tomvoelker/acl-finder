// Hadi Mohammadi's EMNLP Atlas: global area IDs share one palette in both views.
export const AREA_COLORS = ['#88b9e0', '#edb270', '#91c99a', '#ccabe2', '#e69caa', '#7fc9c7', '#d5c875', '#8088d0', '#bfbd9a', '#d7a88b', '#bbdb68', '#c4b1c6', '#d078d0', '#78d078', '#789888', '#c078a8'];

export function readAtlasLabel(data, topicId, localAreaId) {
  const topic = Number.isInteger(topicId) ? data?.topics?.find(topic => topic.id === topicId) : null;
  const areaId = topic ? topic.area : Number.isInteger(localAreaId) ? localAreaId : null;
  const area = data?.areas?.find(area => area.id === areaId);
  if (!area || !AREA_COLORS[area.id]) return null;
  return {id:topic?.id ?? null, label:topic?.label ?? null, description:topic?.description ?? null,
    area:area.id, areaLabel:area.label, color:AREA_COLORS[area.id], source:topic ? 'atlas' : 'local'};
}
