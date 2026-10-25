// Public Cloudflare Web Analytics site token. Tracking stays off on previews.
if (location.hostname === 'emnlp.vlkr.org' &&
    navigator.globalPrivacyControl !== true &&
    !['1', 'yes'].includes(String(navigator.doNotTrack).toLowerCase())) {
  const beacon = document.createElement('script');
  beacon.type = 'module';
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  // The finder uses query-only navigation; count page loads, not filter changes.
  beacon.dataset.cfBeacon = JSON.stringify({ token: '1e43affcb6df4899900a2d34220b18a6', spa: false });
  document.head.append(beacon);
}
