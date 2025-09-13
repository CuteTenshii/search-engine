const searchResultsContainer = document.getElementById('search-results');
const query = window.__INITIAL_STATE__.query_without_filters || '';
const queryRegex = new RegExp(query.replaceAll(/[\s+]/g, '|'), 'gi');

const urlToBreadcrumb = (url, breadcrumbs) => {
  const urlObj = new URL(url);
  const pathSegments = urlObj.pathname.split('/').filter(segment => segment);
  const host = (urlObj.protocol + '//' + urlObj.hostname).replaceAll(queryRegex, (s) => `<b>${s}</b>`);
  if (breadcrumbs && breadcrumbs.length > 1) {
    return host + ' > ' + breadcrumbs.join(' > ');
  }
  return host + (pathSegments.length ? ' > ' + pathSegments.join(' > ').replaceAll(queryRegex, (s) => `<b>${s}</b>`) : '');
}

for (const results of window.__INITIAL_STATE__.results) {
  const resultElement = document.createElement('div');
  resultElement.classList.add('search-result');
  const title = results.title ? results.title.replaceAll(queryRegex, (s) => `<b>${s}</b>`) : results.url;
  const description = results.description ? results.description.replaceAll(queryRegex, (s) => `<b>${s}</b>`) : '<i>No description given</i>';

  resultElement.innerHTML = `
  <a href="${results.url}" class="search-result-header">
    <img src="/proxy/favicon?url=${btoa(results.favicon)}" alt="${results.site_name || results.title}" class="search-result-favicon" />
    <div class="ellipsis">
      <p>${results.site_name || ''}</p>
      <span class="ellipsis">${urlToBreadcrumb(results.url, results.breadcrumbs)}</span>
    </div>
  </a>
  <p><a href="${results.url}">${title}</a></p>
  <p>
    ${results.author ? `By <strong>${results.author}</strong> &ndash; ` : ''}
    ${results.date_published ? `${new Date(results.date_published).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })} &ndash; ` : ''}
    ${description}
  </p>
`;
  searchResultsContainer.appendChild(resultElement);
}