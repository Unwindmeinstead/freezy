# Freezy API Contract

## API Principles

- All endpoints are versioned under `/v1`
- All mutating endpoints require authenticated household membership
- Responses include machine-friendly error codes and human-friendly messages
- AI scan processing is asynchronous

## Authentication

Authentication is handled upstream. API assumes a verified user context and resolves household permissions on each request.

## Error Shape

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Location is required."
  }
}
```

## Households

### `POST /v1/households`

Create a household.

Request:

```json
{
  "name": "Home"
}
```

Response:

```json
{
  "id": "hh_123",
  "name": "Home",
  "timezone": "America/New_York"
}
```

### `GET /v1/households/:householdId`

Return household metadata and current role.

## Locations

### `GET /v1/households/:householdId/locations`

List inventory locations.

### `POST /v1/households/:householdId/locations`

Create a custom location.

## Inventory

### `GET /v1/households/:householdId/inventory`

Query params:

- `locationId`
- `status`
- `category`
- `cursor`
- `limit`

Response:

```json
{
  "items": [
    {
      "id": "inv_123",
      "displayName": "Greek Yogurt",
      "canonicalName": "greek yogurt",
      "category": "Dairy",
      "quantityText": "2 cups",
      "status": "active",
      "freshnessState": "use_soon",
      "locationId": "loc_fridge",
      "confidence": 0.96,
      "source": "scan_confirmed",
      "lastSeenAt": "2026-04-03T13:00:00Z"
    }
  ],
  "nextCursor": null
}
```

### `POST /v1/households/:householdId/inventory/manual`

Add a manual inventory item.

### `PATCH /v1/inventory-items/:inventoryItemId`

Edit quantity, freshness estimate, category, or display name.

### `POST /v1/inventory-items/:inventoryItemId/consume`

Mark all or part of an item as consumed.

Request:

```json
{
  "quantityText": "1 cup"
}
```

### `POST /v1/inventory-items/:inventoryItemId/move`

Move an item between locations.

### `DELETE /v1/inventory-items/:inventoryItemId`

Archive or remove an item.

## Scans

### `POST /v1/households/:householdId/scans/uploads`

Create signed upload targets for one or more images.

Request:

```json
{
  "files": [
    {
      "contentType": "image/jpeg",
      "sizeBytes": 812345
    }
  ]
}
```

Response:

```json
{
  "uploads": [
    {
      "fileId": "file_123",
      "uploadUrl": "https://storage.example.com/...",
      "publicUrl": "https://cdn.example.com/..."
    }
  ]
}
```

### `POST /v1/households/:householdId/scans`

Create a scan job.

Request:

```json
{
  "locationId": "loc_fridge",
  "imageFileIds": ["file_123", "file_456"]
}
```

Response:

```json
{
  "id": "scan_123",
  "status": "queued"
}
```

### `GET /v1/scans/:scanId`

Return scan status and proposals.

Response:

```json
{
  "id": "scan_123",
  "status": "completed",
  "proposals": [
    {
      "proposalId": "prop_1",
      "displayName": "Strawberries",
      "category": "Produce",
      "quantityText": "1 container",
      "freshnessState": "fresh",
      "confidence": 0.88,
      "evidence": [
        {
          "imageUrl": "https://cdn.example.com/scan-1.jpg"
        }
      ]
    }
  ]
}
```

### `POST /v1/scans/:scanId/confirm`

Confirm reviewed proposals and commit inventory events.

Request:

```json
{
  "accepted": [
    {
      "proposalId": "prop_1",
      "displayName": "Strawberries",
      "quantityText": "1 container"
    }
  ],
  "rejectedProposalIds": ["prop_2"]
}
```

## Shopping List

### `GET /v1/households/:householdId/shopping-list`

Return the current list.

### `POST /v1/households/:householdId/shopping-list/items`

Add a manual list item.

### `PATCH /v1/shopping-list-items/:shoppingListItemId`

Update quantity or checked state.

### `DELETE /v1/shopping-list-items/:shoppingListItemId`

Delete an item.

## Recipes

### `GET /v1/households/:householdId/recipes/suggestions`

Return recipes ranked by ingredient match, use-soon opportunity, and effort.

## Receipts

### `POST /v1/households/:householdId/receipts`

Upload and parse a receipt into candidate purchases.

## Barcode

### `POST /v1/barcodes/lookup`

Resolve a barcode into a retail product and optional canonical item mapping.
