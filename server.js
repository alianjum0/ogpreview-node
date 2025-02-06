const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const app = express();

// Helper: escape HTML for safe output.
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

app.get('/', async (req, res) => {
  const url = req.query.url;
  let content = `
    <div class="container my-5">
      <div class="row mb-4">
        <div class="col">
          <h1 class="mb-4">SEO Audit & Social Media Preview</h1>
          <form method="GET" action="/">
            <div class="input-group">
              <input type="text" name="url" class="form-control" placeholder="Enter URL" value="${url ? escapeHtml(url) : ''}" required>
              <button class="btn btn-primary" type="submit">Analyze</button>
            </div>
          </form>
        </div>
      </div>
  `;

  if (url) {
    try {
      // Fetch the target URL
      const response = await axios.get(url);
      const html = response.data;
      const $ = cheerio.load(html);

      // === Basic SEO Elements ===
      const title = $('title').text().trim();
      const metaDescription = $('meta[name="description"]').attr('content')
        ? $('meta[name="description"]').attr('content').trim()
        : '';
      const canonical = $('link[rel="canonical"]').attr('href')
        ? $('link[rel="canonical"]').attr('href').trim()
        : '';
      const firstH1 = $('h1').first().text().trim();
      const lang = $('html').attr('lang')
        ? $('html').attr('lang').trim()
        : '';
      const robots = $('meta[name="robots"]').attr('content')
        ? $('meta[name="robots"]').attr('content').trim()
        : '';
      const viewport = $('meta[name="viewport"]').attr('content')
        ? $('meta[name="viewport"]').attr('content').trim()
        : '';

      // === Open Graph Tags ===
      const ogTitle = $('meta[property="og:title"]').attr('content') || '';
      const ogDescription = $('meta[property="og:description"]').attr('content') || '';
      const ogImage = $('meta[property="og:image"]').attr('content') || "https://via.placeholder.com/600x315.png?text=No+Image";
      const ogUrl = $('meta[property="og:url"]').attr('content') || url;

      // === Twitter Card Tags ===
      const twitterCard = $('meta[name="twitter:card"]').attr('content') || '';
      const twitterTitle = $('meta[name="twitter:title"]').attr('content') || '';
      const twitterDescription = $('meta[name="twitter:description"]').attr('content') || '';
      const twitterImage = $('meta[name="twitter:image"]').attr('content') || ogImage;

      // === SEO Audit Checks ===
      const seoChecks = [
        {
          name: 'Title Tag',
          status: title ? 'Found' : 'Missing',
          suggestion: title 
            ? ((title.length < 30 || title.length > 60) ? 'Title length should be between 30 and 60 characters.' : 'Looks good!')
            : 'Add a <title> tag to the page.'
        },
        {
          name: 'Meta Description',
          status: metaDescription ? 'Found' : 'Missing',
          suggestion: metaDescription 
            ? ((metaDescription.length < 50 || metaDescription.length > 160) ? 'Meta description should be between 50 and 160 characters.' : 'Looks good!')
            : 'Add a meta description for better SEO.'
        },
        {
          name: 'Canonical Tag',
          status: canonical ? 'Found' : 'Missing',
          suggestion: canonical ? 'Looks good!' : 'Add a canonical tag to avoid duplicate content issues.'
        },
        {
          name: 'H1 Tag',
          status: firstH1 ? 'Found' : 'Missing',
          suggestion: firstH1 ? 'Looks good!' : 'Add at least one <h1> tag for the main heading.'
        },
        {
          name: 'Language Attribute',
          status: lang ? `Found (${lang})` : 'Missing',
          suggestion: lang ? 'Looks good!' : 'Specify the language attribute in the <html> tag, e.g., <html lang="en">.'
        },
        {
          name: 'Robots Meta Tag',
          status: robots ? 'Found' : 'Missing',
          suggestion: robots ? 'Looks good!' : 'Add a robots meta tag to control search engine crawling, e.g., <meta name="robots" content="index,follow">.'
        },
        {
          name: 'Viewport Meta Tag',
          status: viewport ? 'Found' : 'Missing',
          suggestion: viewport ? 'Looks good!' : 'Add a viewport meta tag to ensure mobile responsiveness.'
        },
        {
          name: 'Open Graph Tags',
          status: (ogTitle && ogDescription && ogImage && ogUrl) ? 'Complete' : 'Incomplete',
          suggestion: (ogTitle && ogDescription && ogImage && ogUrl) 
            ? 'Looks good!' 
            : 'Ensure all required OG tags are present: og:title, og:description, og:image, and og:url.'
        },
        {
          name: 'Twitter Card Tags',
          status: (twitterCard && twitterTitle && twitterDescription && twitterImage) ? 'Complete' : 'Incomplete',
          suggestion: (twitterCard && twitterTitle && twitterDescription && twitterImage) 
            ? 'Looks good!' 
            : 'Consider adding Twitter Card tags for better social sharing.'
        }
      ];

      // Build the SEO Audit Table rows
      let seoAuditRows = '';
      seoChecks.forEach(check => {
        seoAuditRows += `
          <tr>
            <td>${escapeHtml(check.name)}</td>
            <td>${escapeHtml(check.status)}</td>
            <td>${escapeHtml(check.suggestion)}</td>
          </tr>
        `;
      });

      // === Collect All OG/Twitter Meta Tags (for reference) ===
      let metaTags = {};
      $('meta').each((i, el) => {
        const property = $(el).attr('property');
        const nameAttr = $(el).attr('name');
        const contentAttr = $(el).attr('content');
        if (contentAttr) {
          if (property && (property.startsWith('og:') || property.startsWith('twitter:'))) {
            metaTags[property] = contentAttr;
          }
          if (nameAttr && (nameAttr.startsWith('og:') || nameAttr.startsWith('twitter:'))) {
            metaTags[nameAttr] = contentAttr;
          }
        }
      });

      let metaRows = '';
      for (const [key, value] of Object.entries(metaTags)) {
        metaRows += `
          <tr>
            <td>${escapeHtml(key)}</td>
            <td>${escapeHtml(value)}</td>
          </tr>`;
      }

      // === Build the Output HTML ===

      // SEO Audit Section
      content += `
        <h2 class="mb-3">SEO Audit</h2>
        <div class="table-responsive mb-5">
          <table class="table table-bordered">
            <thead class="table-light">
              <tr>
                <th>SEO Element</th>
                <th>Status</th>
                <th>Suggestion</th>
              </tr>
            </thead>
            <tbody>
              ${seoAuditRows}
            </tbody>
          </table>
        </div>
      `;

      // Website Preview Section (using OG data)
      content += `
        <h2 class="mb-3">Website Preview</h2>
        <div class="card mb-4">
          <img src="${ogImage}" class="card-img-top" alt="OG Image">
          <div class="card-body">
            <h5 class="card-title">${ogTitle || title || 'No Title Found'}</h5>
            <p class="card-text">${ogDescription || metaDescription || 'No Description Found'}</p>
            <a href="${ogUrl}" class="btn btn-primary" target="_blank">${ogUrl}</a>
          </div>
        </div>
      `;

      // Social Media Preview Section
      content += `
        <h2 class="mb-3">Social Media Previews</h2>
        <div class="row mb-4">
          <div class="col-md-4">
            <div class="card">
              <img src="${ogImage}" class="card-img-top" alt="Facebook Preview">
              <div class="card-body">
                <h5 class="card-title">${ogTitle || 'No Title'}</h5>
                <p class="card-text">${ogDescription || 'No Description'}</p>
                <span class="badge bg-primary">Facebook</span>
              </div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card">
              <img src="${twitterImage}" class="card-img-top" alt="Twitter Preview">
              <div class="card-body">
                <h5 class="card-title">${twitterTitle || ogTitle || 'No Title'}</h5>
                <p class="card-text">${twitterDescription || ogDescription || 'No Description'}</p>
                <span class="badge bg-info text-dark">Twitter</span>
              </div>
            </div>
          </div>
          <div class="col-md-4">
            <div class="card">
              <img src="${ogImage}" class="card-img-top" alt="TikTok Preview">
              <div class="card-body">
                <h5 class="card-title">${ogTitle || 'No Title'}</h5>
                <p class="card-text">${ogDescription || 'No Description'}</p>
                <span class="badge bg-dark">TikTok</span>
              </div>
            </div>
          </div>
        </div>
      `;

      // All Meta Tags Section
      content += `
        <h2 class="mb-3">All OG/Twitter Meta Tags</h2>
        <div class="table-responsive mb-5">
          <table class="table table-striped">
            <thead class="table-light">
              <tr>
                <th>Tag</th>
                <th>Content</th>
              </tr>
            </thead>
            <tbody>
              ${metaRows}
            </tbody>
          </table>
        </div>
      `;
    } catch (error) {
      content += `
        <div class="alert alert-danger" role="alert">
          Error fetching URL: ${escapeHtml(error.message)}
        </div>
      `;
    }
  }

  content += `</div>`; // Close container

  // Wrap content in full HTML with Bootstrap
  const htmlResponse = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>SEO Audit & Preview</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body>
      ${content}
      <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    </body>
    </html>
  `;
  res.send(htmlResponse);
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

