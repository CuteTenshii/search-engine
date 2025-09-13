a search engine

## Usage

```bash
bun run src/index.ts
```

Then open your browser and go to `http://localhost:3000`.

To start crawling, go to `http://localhost:3000/crawl?url=<URL>`. To ignore external links (links that point to a different domain), use `http://localhost:3000/crawl?url=<URL>&ignoreExternal=true`.

## Crawled data

The crawled data is stored in a SQLite database file named `crawler.db`, in a table named `pages`.

Each time a page is crawled, its information is updated in the database. Here's a brief overview of the table schema:

| Column         | Description                              | Where it comes from (in order of priority)                                                                                                                        |
|----------------|------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| url            | The URL of the page (primary key)        | The URL itself                                                                                                                                                    |
| title          | The title of the page                    | `<title>` tag, `og:title`, `twitter:title` meta tags, `<h1>` tag                                                                                                  |
| description    | The description of the page              | `meta[name="description"]`, `og:description`, `twitter:description` meta tags, `description` string in `manifest.json`                                            |
| keywords       | The keywords of the page                 | `meta[name="keywords"]` meta tag                                                                                                                                  |
| author         | The author of the page                   | `meta[name="author"]`, `article:author` meta tags, author in LD+JSON scripts                                                                                      |
| favicon        | The URL of the favicon                   | `<link rel="icon">`, `<link rel="shortcut icon">`, `<link rel="apple-touch-icon">` tags, `icons[]` array in `manifest.json`, fetches `/favicon.ico` if none found |
| date_published | The publication date of the page/article | `article:published_time`, `time[datetime]` tags                                                                                                                   |
| created_at     | The date the page was crawled            | The current date when the page is crawled                                                                                                                         |
| updated_at     | The date the page was last updated       | The current date when the page is crawled                                                                                                                         |
| site_url       | The `og:site_name` meta tag or app name  | `og:site_name` meta tag or the app name if not available                                                                                                          |
| language       | The language of the page                 | `<html lang="">` attribute, `og:locale` meta tag                                                                                                                  |

### Android/iOS apps

For websites that have associated mobile applications, the following fields are also extracted:
- `meta[name="apple-itunes-app"]` meta tag for iOS apps
- `meta[name="google-play-app"]` meta tag for Android apps
- `manifest.json`: `related_applications[]` array

### LD+JSON

If the page contains LD+JSON scripts, the following schemas are extracted from them (if available):
- `BreadcrumbList` for breadcrumbs

## Favicons proxying

To circumvent issues when fetching favicons, this project proxies favicon requests through a dedicated endpoint. This ensures that favicons are always accessible and correctly displayed, regardless of the original source's restrictions or configurations.

Also, for caching purposes, the favicons are stored in the `favicons` directory.