# Efficient API Structure

> [!info] Source
> Parsed from `captured/response.md`.
>
> API endpoint captured in the file:
>
> ```text
> https://efficient.app/api/nav
> ```

## Summary

`captured/response.md` contains **navigation/menu data**, not the full homepage data.

The screenshot shows the full Efficient homepage, but this API response only contains data for nav/dropdown/menu sections such as:

- Discover menu
- Deals menu
- Stacks menu
- Comparisons menu
- Courses menu
- App logos/icons/colors used inside those menus

> [!warning] Important
> Homepage body content like hero text, testimonials, "Trusted by 2 million teams", large feature sections, dark cards, footer text, and most visual page layout data are **not present** in this API response.

---

## Top-Level JSON

```ts
type EfficientNavResponse = {
  discoverMenu: DiscoverMenu
  dealsMenu: DealsMenu
  stacksMenu: StacksMenu
  comparisonsMenu: ComparisonsMenu
  coursesMenu: CoursesMenu
}
```

Top-level keys:

| Key | Type | Used For |
|---|---:|---|
| `discoverMenu` | `object` | Discover dropdown/navigation |
| `dealsMenu` | `object` | Deals dropdown/navigation |
| `stacksMenu` | `object` | Software stack dropdown/navigation |
| `comparisonsMenu` | `object` | Comparison dropdown/navigation |
| `coursesMenu` | `object` | Courses dropdown/navigation |

---

## Screenshot To API Mapping

| Screenshot Section | Present In `captured/response.md`? | Data Source |
|---|---:|---|
| Header/nav menus | Yes | `discoverMenu`, `dealsMenu`, `stacksMenu`, `comparisonsMenu`, `coursesMenu` |
| App logos in nav/dropdowns | Yes | `icon`, `glyph`, `homepageImage` |
| App names/descriptions | Yes | App objects inside menu arrays |
| Deal cards/list | Partially | `dealsMenu.deals` |
| Best apps/review apps/alternative apps | Yes | `discoverMenu.bestApps`, `discoverMenu.reviewsApps`, `discoverMenu.alternativesApps` |
| Stack menu/cards | Yes | `stacksMenu.stacks` |
| Comparison menu/cards | Yes | `comparisonsMenu.comparisons` |
| Course menu/cards | Yes | `coursesMenu.courses` |
| Hero heading | No | Not in this API |
| Search box text | No | Not in this API |
| "Trusted by 2 million teams" | No | Not in this API |
| Testimonials | No | Not in this API |
| Main homepage sections | No | Not in this API |
| Footer columns | No | Not in this API |

---

## Shared Data Formats

### Image Asset

Used for app logos, glyphs, homepage preview images, and icons.

```ts
type ImageAsset = {
  id: number
  coveragePercent: number | null
  xOffsetPercent: number | null
  yOffsetPercent: number | null
  alt: string
  url: string
  filename: string
}
```

Example:

```json
{
  "id": 750,
  "coveragePercent": 100,
  "xOffsetPercent": 0,
  "yOffsetPercent": 0,
  "alt": "Superhuman Logo",
  "url": "https://assets.efficient.app/3600a28eb831adea94235ec875f52a8ae173d01944614cca7821243bafeaa145.svg",
  "filename": "3600a28eb831adea94235ec875f52a8ae173d01944614cca7821243bafeaa145.svg"
}
```

### App

Used across discover, deals, stacks, comparisons, and courses.

```ts
type App = {
  id: number
  slug?: string
  name: string
  description?: string
  icon: ImageAsset | null
  glyph: ImageAsset | null
  homepageImage?: ImageAsset | null
  brandBackgroundColor: string | null
  brandPrimaryColor: string | null
  brandSecondaryColor?: string | null
  brandTertiaryColor?: string | null
}
```

Important fields:

| Field | Format | Meaning |
|---|---|---|
| `id` | number | Internal app ID |
| `slug` | string | URL-friendly app slug |
| `name` | string | Display name |
| `description` | string | Short app description |
| `icon` | `ImageAsset \| null` | Full logo/icon |
| `glyph` | `ImageAsset \| null` | Simplified logo mark |
| `homepageImage` | `ImageAsset \| null` | Product/homepage preview image |
| `brandBackgroundColor` | hex string/null | Brand background color |
| `brandPrimaryColor` | hex string/null | Main brand color |
| `brandSecondaryColor` | hex string/null | Secondary brand color |
| `brandTertiaryColor` | hex string/null | Tertiary brand color |

### Category

Used in deals, stacks, and comparisons.

```ts
type Category = {
  id: number
  name: string
  slug: string
  icon: string
  featuredOrder?: number | null
  isBroadCategory?: boolean
  appRecommendations?: {
    docs: number[]
    hasNextPage: boolean
  }
}
```

### Rich Text

Fields like `summary` and `tldr` are stored as **Lexical editor JSON**, not markdown.

```ts
type LexicalRichText = {
  root: {
    type: "root"
    format: string
    indent: number
    version: number
    children: LexicalNode[]
    direction: string | null
  }
}
```

Example shape:

```json
{
  "root": {
    "type": "root",
    "children": [
      {
        "type": "paragraph",
        "children": [
          {
            "type": "text",
            "text": "This guide skips generic advice and focuses on the apps modern companies actually use."
          }
        ]
      }
    ]
  }
}
```

### Date Format

Dates use ISO 8601 strings:

```text
2026-06-05T20:40:36.912Z
```

---

## `discoverMenu`

Used for the Discover navigation/dropdown.

```ts
type DiscoverMenu = {
  dealCount: number
  stackCount: number
  comparisonCount: number
  bestApps: App[]
  reviewsApps: App[]
  alternativesApps: App[]
}
```

Counts:

| Field | Value |
|---|---:|
| `dealCount` | `68` |
| `stackCount` | `36` |
| `comparisonCount` | `651` |

### `discoverMenu.bestApps`

Format:

```ts
bestApps: App[]
```

Apps:

| Order | App |
|---:|---|
| 1 | Superhuman Mail |
| 2 | Viktor |
| 3 | Granola |
| 4 | Mercury |
| 5 | Littlebird |
| 6 | Supercut |

Used data:

- App ID
- Slug
- App name
- Description
- Icon
- Glyph
- Homepage image
- Brand colors

### `discoverMenu.reviewsApps`

Format:

```ts
reviewsApps: App[]
```

Apps:

| Order | App |
|---:|---|
| 1 | Superhuman Mail |
| 2 | Viktor |
| 3 | Mercury |
| 4 | Granola |
| 5 | Kick |
| 6 | Supercut |

### `discoverMenu.alternativesApps`

Format:

```ts
alternativesApps: App[]
```

Apps:

| Order | App |
|---:|---|
| 1 | Gmail |
| 2 | Monday |
| 3 | Calendly |
| 4 | Brex |
| 5 | Notion |
| 6 | Fyxer AI |

---

## `dealsMenu`

Used for Deals navigation/dropdown.

```ts
type DealsMenu = {
  deals: Deal[]
  categories: Category[]
  categoryCounts: Record<string, number>
}
```

### Deal Format

```ts
type Deal = {
  id: number
  app: AppWithDeals
  startDate: string | null
  endDate: string | null
  order: number
  featuredOrder: number
  name: string
}
```

### Nested Deal Detail Format

Inside each deal app:

```ts
type AppWithDeals = App & {
  deals: {
    docs: DealDetail[]
    hasNextPage: boolean
  }
}
```

```ts
type DealDetail = {
  id: number
  displayName: string
  app: number
  product: number | null
  link: number
  startDate: string | null
  endDate: string | null
  claimed: number
  order: number
  archived: boolean
  isFeatured: boolean
  featuredOrder: number
  name: string
  unitType: "days" | "percent" | "currency" | string
  isReward: boolean
  quantity: number | null
  durationDays: number | null
  value: number
  eligibility: string
  promoCode: string | null
  terms: string | null
  emailIsRequired: boolean
  transactionalEmailId: number | null
  claimValue: string | null
  companyIsRequired: boolean
  teamSizeIsRequired: boolean
  dealCustomers: {
    docs: unknown[]
    hasNextPage: boolean
  }
  updatedAt: string
  createdAt: string
  _status: string
}
```

### Deals List

| Order | Deal | App |
|---:|---|---|
| 1 | 30 Days Free | Superhuman Mail |
| 2 | 3 Months Free | Granola |
| 3 | $20 off | Littlebird |
| 4 | $200 off | Viktor |
| 5 | Get $250 Cash | Mercury |
| 6 | $15 credit | Wispr Flow |
| 7 | Get $250 Cash | Ramp |
| 8 | $100 off Motion Course | Motion |
| 9 | 25% off (1 year) | Kick |
| 10 | Free Crash Course | Copper |

### Deal Categories

Format:

```ts
categories: Category[]
```

Categories:

| ID | Name | Slug | Icon |
|---:|---|---|---|
| 50 | Email | `email` | `envelope` |
| 53 | Project Management | `project-management` | `suitcase-3` |
| 42 | Business Banking | `business-banking` | `scale` |
| 56 | CRM | `crm` | `users` |
| 45 | AI | `ai` | `sparkle-ai` |
| 12 | Todo List | `todo-list` | `tasks-2` |
| 15 | Daily Planner | `daily-planner` | `target` |

### `categoryCounts`

Format:

```ts
categoryCounts: Record<string, number>
```

This is a lookup object where:

- Key = category ID as a string
- Value = number of matching deals/apps/items

Example:

```json
{
  "50": 13,
  "53": 18,
  "42": 12
}
```

---

## `stacksMenu`

Used for software stack navigation/dropdown.

```ts
type StacksMenu = {
  stacks: Stack[]
  categories: Category[]
  categoryCounts: Record<string, number>
}
```

### Stack Format

```ts
type Stack = {
  id: number
  slug: string
  icon: string
  name: string
  description: string
  summary: LexicalRichText
  stackApps: {
    docs: StackApp[]
    hasNextPage: boolean
  }
}
```

```ts
type StackApp = {
  id: number
  app: App
}
```

### Stacks List

| Order | Stack | Apps Count |
|---:|---|---:|
| 1 | Small Business | 22 |
| 2 | AI-Powered | 11 |
| 3 | Startup (Complete) | 30 |
| 4 | Startup Operations | 11 |
| 5 | Startup Finance | 6 |
| 6 | Startup Growth | 11 |

### Stack Categories

Same visible category set as `dealsMenu.categories`:

| ID | Name | Slug | Icon |
|---:|---|---|---|
| 50 | Email | `email` | `envelope` |
| 53 | Project Management | `project-management` | `suitcase-3` |
| 42 | Business Banking | `business-banking` | `scale` |
| 56 | CRM | `crm` | `users` |
| 45 | AI | `ai` | `sparkle-ai` |
| 12 | Todo List | `todo-list` | `tasks-2` |
| 15 | Daily Planner | `daily-planner` | `target` |

---

## `comparisonsMenu`

Used for comparison navigation/dropdown.

```ts
type ComparisonsMenu = {
  comparisons: Comparison[]
  categories: Category[]
}
```

### Comparison Format

```ts
type Comparison = {
  id: number
  name: string
  comparisonApps: {
    docs: ComparisonApp[]
    hasNextPage: boolean
  }
  tldr: LexicalRichText
}
```

```ts
type ComparisonApp = {
  id: number
  app: App
}
```

### Comparisons List

| Order | Comparison |
|---:|---|
| 1 | Superhuman Mail vs Gmail |
| 2 | Mercury Bank vs Novo |
| 3 | Copper vs folk |

### Comparison Categories

`comparisonsMenu.categories` contains **51 categories**.

Each category can include app recommendation IDs:

```ts
appRecommendations: {
  docs: number[]
  hasNextPage: boolean
}
```

Example category:

```json
{
  "id": 50,
  "name": "Email",
  "slug": "email",
  "appRecommendations": {
    "docs": [77, 240, 31, 71, 73, 227, 237, 27, 87, 88],
    "hasNextPage": false
  },
  "icon": "envelope",
  "featuredOrder": 1,
  "isBroadCategory": false
}
```

---

## `coursesMenu`

Used for courses navigation/dropdown.

```ts
type CoursesMenu = {
  courses: Course[]
}
```

### Course Format

```ts
type Course = {
  id: number
  app: App
  name: string
  duration: string
  moduleCount: number
}
```

### Courses List

| Order | Course | App | Duration | Modules |
|---:|---|---|---:|---:|
| 1 | Motion Course | Motion | 2h 20m | 8 |
| 2 | Copper Course | Copper | 6h | 6 |

---

## Data Usage By UI Area

### Navigation Header

Likely uses:

- `discoverMenu`
- `dealsMenu`
- `stacksMenu`
- `comparisonsMenu`
- `coursesMenu`

Data used:

- Menu labels
- Counts
- Featured app lists
- Featured deal lists
- Category lists
- Icons
- Brand colors

### Discover Dropdown

Uses:

```text
discoverMenu.bestApps
discoverMenu.reviewsApps
discoverMenu.alternativesApps
discoverMenu.dealCount
discoverMenu.stackCount
discoverMenu.comparisonCount
```

Each app card likely uses:

- `name`
- `description`
- `slug`
- `icon` or `glyph`
- `homepageImage`
- `brandBackgroundColor`
- `brandPrimaryColor`

### Deals Dropdown

Uses:

```text
dealsMenu.deals
dealsMenu.categories
dealsMenu.categoryCounts
```

Each deal card likely uses:

- `deal.name`
- `deal.app.name`
- `deal.app.slug`
- `deal.app.icon`
- `deal.app.glyph`
- `deal.app.brandBackgroundColor`
- nested `deal.app.deals.docs[]`
- `claimed`
- `promoCode`
- `terms`
- `value`
- `unitType`
- `durationDays`

### Stacks Dropdown

Uses:

```text
stacksMenu.stacks
stacksMenu.categories
stacksMenu.categoryCounts
```

Each stack card likely uses:

- `name`
- `description`
- `slug`
- `icon`
- `summary`
- `stackApps.docs[].app`

### Comparisons Dropdown

Uses:

```text
comparisonsMenu.comparisons
comparisonsMenu.categories
```

Each comparison item likely uses:

- `name`
- `comparisonApps.docs[].app.name`
- `comparisonApps.docs[].app.icon`
- `comparisonApps.docs[].app.glyph`
- `tldr`

### Courses Dropdown

Uses:

```text
coursesMenu.courses
```

Each course card likely uses:

- `name`
- `duration`
- `moduleCount`
- `app.name`
- `app.description`
- `app.icon`
- `app.glyph`
- `app.brandPrimaryColor`

---

## Data Not Included In This API

These are visible in the screenshot but missing from `captured/response.md`:

```text
Hero heading
Hero subtitle
Search input placeholder
Search suggestions
Trusted by 2 million teams
Customer/team logos in the homepage body
Homepage testimonial cards
Large dark product-review sections
Homepage feature headings
Homepage marketing copy
Homepage footer columns
Footer social links
Most layout/styling metadata
```

> [!note] Interpretation
> `captured/response.md` is enough to reconstruct the site navigation/dropdowns, but it is not enough to reconstruct the full homepage shown in the screenshot.

---

## Quick Data Inventory

| Data Group | Count |
|---|---:|
| Discover best apps | 6 |
| Discover review apps | 6 |
| Discover alternative apps | 6 |
| Featured deals | 10 |
| Deal categories | 7 |
| Stacks | 6 |
| Stack categories | 7 |
| Comparisons | 3 |
| Comparison categories | 51 |
| Courses | 2 |

---

## Suggested Frontend Types

```ts
export type EfficientNavResponse = {
  discoverMenu: DiscoverMenu
  dealsMenu: DealsMenu
  stacksMenu: StacksMenu
  comparisonsMenu: ComparisonsMenu
  coursesMenu: CoursesMenu
}

export type DiscoverMenu = {
  dealCount: number
  stackCount: number
  comparisonCount: number
  bestApps: App[]
  reviewsApps: App[]
  alternativesApps: App[]
}

export type DealsMenu = {
  deals: Deal[]
  categories: Category[]
  categoryCounts: Record<string, number>
}

export type StacksMenu = {
  stacks: Stack[]
  categories: Category[]
  categoryCounts: Record<string, number>
}

export type ComparisonsMenu = {
  comparisons: Comparison[]
  categories: Category[]
}

export type CoursesMenu = {
  courses: Course[]
}
```
