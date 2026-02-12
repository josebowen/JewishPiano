function searchData() {
  const query = document.getElementById('search').value.toLowerCase();
  const resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML = '';

  composers.forEach(comp => {
    if (
      comp.name.toLowerCase().includes(query) ||
      comp.country.toLowerCase().includes(query) ||
      comp.works.some(w => w.title.toLowerCase().includes(query))
    ) {
      let html = `<h2>${comp.name} (${comp.birth}-${comp.death})</h2>`;
      html += `<p><strong>Country:</strong> ${comp.country}</p>`;
      html += `<p><a href="${comp.imslp}" target="_blank">IMSLP Works List</a></p>`;
      html += "<ul>";
      comp.works.forEach(w => {
        html += `<li>${w.title} (${w.year || ""}) – ${w.type}</li>`;
      });
      html += "</ul>";
      resultsDiv.innerHTML += html;
    }
  });
}

window.onload = searchData;
