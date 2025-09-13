export function ldJsonToObject(ldJson: string[]): Output {
  try {
    const json = JSON.parse(`[${ldJson.join(",")}]`) as LDJson[];
    const results: Output = {};
    for (const item of json) {
      if (item["@type"] === "BreadcrumbList" && Array.isArray(item.itemListElement)) {
        results.breadcrumbs = item.itemListElement
          .map(el => typeof el === 'string' ? null : el)
          .filter((el): el is LDJson & {
            position: number;
            name: string;
            url?: string;
          } => el !== null && el.position !== undefined && el.name !== undefined)
          .sort((a, b) => a.position - b.position)
          .map(el => el.name);
      } else if (item["@type"] === "Article") {
        if (item.datePublished && !results.datePublished) {
          results.datePublished = new Date(item.datePublished).toISOString();
        }
        if (item.author && !results.author) {
          if (typeof item.author === 'string') {
            results.author = item.author;
          } else if (Array.isArray(item.author)) {
            const author = item.author.find(a => typeof a === 'object' && a.name);
            if (author && typeof author === 'object' && author.name) {
              results.author = author.name;
            }
          }
        }
      }
    }
    return results;
  } catch (e) {
    console.error(e);
    return {};
  }
}

interface Output {
  breadcrumbs?: string[];
  datePublished?: string;
  author?: string;
  headline?: string;
}

interface LDJson {
  "@context"?: string;
  "@type"?: LDJsonType | LDJsonType[];
  itemListElement?: (LDJson | string)[];
  position?: number;
  name?: string;
  description?: string;
  url?: string;
  image?: string | { "@type": "ImageObject"; url: string; width?: number; height?: number; } | ({ "@type": "ImageObject"; url: string; width?: number; height?: number; } | string)[];
  author?: string | { "@type": "Person" | "Organization"; name: string; url?: string; } | ({ "@type": "Person" | "Organization"; name: string; url?: string; } | string)[];
  publisher?: { "@type": "Organization" | "Person"; name: string; logo?: { "@type": "ImageObject"; url: string; width?: number; height?: number; }; } | string;
  datePublished?: string;
  dateModified?: string;
  mainEntityOfPage?: string | { "@type": "WebSite" | "WebPage"; "@id": string; };
  headline?: string;
  keywords?: string;
  review?: { "@type": "Review"; author: string | { "@type": "Person" | "Organization"; name: string; url?: string; }; datePublished: string; reviewBody: string; reviewRating: { "@type": "Rating"; ratingValue: number | string; bestRating?: number | string; worstRating?: number | string; }; } | { "@type": "Review"; author: string | { "@type": "Person" | "Organization"; name: string; url?: string; }; datePublished: string; reviewBody: string; reviewRating: { "@type": "Rating"; ratingValue: number | string; bestRating?: number | string; worstRating?: number | string; }; }[];
  aggregateRating?: { "@type": "AggregateRating"; ratingValue: number | string; reviewCount: number | string; bestRating?: number | string; worstRating?: number | string; };
  offers?: { "@type": "Offer"; price: number | string; priceCurrency: string; availability?: string; url?: string; priceValidUntil?: string; itemCondition?: string; seller?: { "@type": "Organization" | "Person"; name: string; }; } | { "@type": "Offer"; price: number | string; priceCurrency: string; availability?: string; url?: string; priceValidUntil?: string; itemCondition?: string; seller?: { "@type": "Organization" | "Person"; name: string; }; }[];
  recipeIngredient?: string[];
  recipeInstructions?: (string | { "@type": "HowToStep"; text: string; } | { "@type": "HowToSection"; name: string; itemListElement: (string | { "@type": "HowToStep"; text: string; })[]; })[];
  totalTime?: string;
  prepTime?: string;
  cookTime?: string;
  recipeYield?: string;
  recipeCategory?: string | string[];
  recipeCuisine?: string | string[];
  nutrition?: { "@type": "NutritionInformation"; calories?: string; fatContent?: string; carbohydrateContent?: string; proteinContent?: string; fiberContent?: string; sugarContent?: string; sodiumContent?: string; };
  inLanguage?: string;
  about?: string | { "@type": LDJsonType; name: string; url?: string; } | ({ "@type": LDJsonType; name: string; url?: string; } | string)[];
  location?: { "@type": "Place" | "PostalAddress"; name?: string; address?: string | { "@type": "PostalAddress"; streetAddress?: string; addressLocality?: string; addressRegion?: string; postalCode?: string; addressCountry?: string; }; geo?: { "@type": "GeoCoordinates"; latitude: number | string; longitude: number | string; }; } | string;
  startDate?: string;
  endDate?: string;
  eventStatus?: string;
  eventAttendanceMode?: string;
  performer?: { "@type": "Person" | "Organization"; name: string; url?: string; } | ({ "@type": "Person" | "Organization"; name: string; url?: string; } | string)[];
  audience?: { "@type": "Audience"; audienceType: string; };
  hasPart?: LDJson | LDJson[];
  isPartOf?: LDJson | LDJson[];
  citation?: string | LDJson | (string | LDJson)[];
  sameAs?: string | string[];
  additionalType?: string;
  alternateName?: string;
  disambiguatingDescription?: string;
  identifier?: string | { "@type": "PropertyValue"; propertyID: string; value: string; } | ({ "@type": "PropertyValue"; propertyID: string; value: string; } | string)[];
  potentialAction?: { "@type": "Action"; name?: string; target: string | { "@type": "EntryPoint"; urlTemplate: string; actionPlatform?: string | string[]; } | ({ "@type": "EntryPoint"; urlTemplate: string; actionPlatform?: string | string[]; } | string)[]; } | { "@type": "Action"; name?: string; target: string | { "@type": "EntryPoint"; urlTemplate: string; actionPlatform?: string | string[]; } | ({ "@type": "EntryPoint"; urlTemplate: string; actionPlatform?: string | string[]; } | string)[]; }[];
  headlineUrl?: string;
  siteName?: string;
  language?: string;
}

type LDJsonType =
  | "Article"
  | "Blog"
  | "BlogPosting"
  | "BreadcrumbList"
  | "CreativeWork"
  | "Event"
  | "FAQPage"
  | "HowTo"
  | "ImageObject"
  | "ItemList"
  | "LocalBusiness"
  | "Organization"
  | "Person"
  | "Product"
  | "Recipe"
  | "Review"
  | "Service"
  | "WebSite"
  | string;