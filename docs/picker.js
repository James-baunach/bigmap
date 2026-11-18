/* "Place" box: find any US city or address with OpenStreetMap search and reload the page mapped there
   (?lat=..&lon=..&mi=..&name=..; live.js reads those). Also relabels the page for a live area. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const L = window.LIVE;
if (L) {
  document.body.classList.add('live');
  const short = L.name.split(',')[0];
  $('appTitle').textContent = short + ' Wall Map Maker';
  document.title = short + ' Wall Map Maker';
  $('areaNow').innerHTML = 'Showing: <b></b> (about ' + (L.mi === '7' ? '7.5' : L.mi === '19' ? '19' : '11') + ' miles across, from OpenStreetMap)';
  $('areaNow').querySelector('b').textContent = L.name;
  $('areaMi').value = L.mi;
  $('backLou').hidden = false;
  $('ringsFrom').textContent = 'the center';
}
const msg = t => { $('areaMsg').textContent = t; };
/* a short readable name from a Nominatim result: "Boulder, Colorado" */
function shortName(d) {
  const a = d.address || {};
  const place = a.city || a.town || a.village || a.hamlet || a.suburb || a.county || String(d.name || d.display_name || '').split(',')[0];
  const head = d.addresstype && !['city', 'town', 'village', 'hamlet', 'municipality', 'county', 'suburb'].includes(d.addresstype) && d.name ? d.name : place;
  return [head, a.state].filter(Boolean).join(', ').slice(0, 60);
}
async function find() {
  const q = $('areaQ').value.trim(), list = $('areaRes');
  list.textContent = '';
  if (!q) { msg('Type a city, town or address first.'); return; }
  $('areaGo').disabled = true;
  msg('Searching...');
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=us&q=' + encodeURIComponent(q), { signal: ctl.signal });
    if (!res.ok) throw new Error('The search service answered with an error (' + res.status + ').');
    const data = await res.json();
    const hits = (Array.isArray(data) ? data : []).map(d => ({ lat: parseFloat(d.lat), lon: parseFloat(d.lon), full: String(d.display_name || ''), name: shortName(d) }))
      .filter(h => Number.isFinite(h.lat) && Number.isFinite(h.lon));
    if (!hits.length) { msg('No US place found. Try the city and state, like "Asheville, NC".'); return; }
    msg('Choose a result to map it:');
    for (const h of hits) {
      const li = document.createElement('li'), b = document.createElement('button');
      b.type = 'button'; b.textContent = h.full;
      b.addEventListener('click', () => {
        const u = new URLSearchParams({ lat: h.lat.toFixed(5), lon: h.lon.toFixed(5), mi: $('areaMi').value, name: h.name || h.full.split(',')[0] });
        location.href = location.pathname + '?' + u.toString();
      });
      li.appendChild(b); list.appendChild(li);
    }
  } catch (err) {
    msg(err.name === 'AbortError' ? 'The search took too long. Check your connection and try again.' : 'Could not reach the search service. Check your connection and try again.');
  } finally { clearTimeout(to); $('areaGo').disabled = false; }
}
$('areaGo').addEventListener('click', find);
$('areaQ').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); find(); } });
/* changing the size of a live area reloads it at the new size, keeping the place */
$('areaMi').addEventListener('change', () => {
  if (!L) return;
  const u = new URLSearchParams(location.search);
  u.set('mi', $('areaMi').value);
  location.href = location.pathname + '?' + u.toString();
});
})();
