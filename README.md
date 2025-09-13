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

| Column         | Description                             |
|----------------|-----------------------------------------|
| url            | The URL of the page (primary key)       |
| title          | The title of the page                   |
| description    | The description of the page             |
| keywords       | The keywords of the page                |
| author         | The author of the page                  |
| favicon        | The URL of the favicon                  |
| date_published | The publication date of the page        |
| created_at     | The date the page was crawled           |
| updated_at     | The date the page was last updated      |
| site_url       | The `og:site_name` meta tag or app name |
| language       | The language of the page                |

## Favicons proxying

To circumvent issues when fetching favicons, this project proxies favicon requests through a dedicated endpoint. This ensures that favicons are always accessible and correctly displayed, regardless of the original source's restrictions or configurations.

Also, for caching purposes, the favicons are stored in the `favicons` directory.