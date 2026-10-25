// The GSAM sync already supplies stream fields. Keep the status vocabulary in
// step with its DeepDiveStreamFields contract; do not infer a percentage.
const STATUS = {
  not_started: 'Not started',
  under_way: 'Under way',
  examined: 'Examined',
  blocked: 'Blocked',
};

export function sharedStreams(items) {
  return items.filter((item) => item.type === 'deep_dive_stream').map((item) => ({
    id: item.id,
    title: item.title,
    summary: item.summary,
    status: STATUS[item.fields?.status] || 'Status unavailable',
  }));
}
