# Freezy Production Architecture

## Product Goal

Freezy should become the household system of record for food at home. The product must unify capture, inventory, planning, and replenishment.

Core user outcomes:

- know what is at home
- know what to use next
- know what to buy
- know what to cook
- reduce waste and grocery spend

## V1 Scope

V1 should optimize for trust and repeated weekly usage, not autonomous magic.

Included:

- household accounts and shared access
- fridge, freezer, and pantry locations
- photo and multi-angle scan flows
- scan review and correction before inventory commit
- manual add, edit, delete, and consume flows
- barcode lookup
- receipt import
- shopping list generation
- use-soon queue
- recipe suggestions from inventory
- notifications for spoilage risk and low staples

Excluded from V1:

- full autonomous inventory with no review
- broad retailer checkout integrations
- appliance and IoT integrations
- advanced nutrition and medical claims

## System Overview

### Clients

- Web app: Next.js + TypeScript
- Mobile web first, desktop fully supported
- Shared UI primitives and typed API client

### Backend Services

- API service: authenticated REST API for households, inventory, scans, shopping, and recipes
- Scan orchestration worker: async processing of uploads and model calls
- Notification worker: reminder, spoilage, and low-stock jobs
- Normalization service: canonical naming, dedupe, category mapping, and household memory

### Infrastructure

- Postgres for primary relational data
- Redis for queues, caching, rate limits, and job coordination
- Object storage for scan images and derived thumbnails
- Error monitoring and analytics
- Feature flags for controlled rollout of AI-dependent features

## Core Architecture Principles

1. Inventory must be event-derived.
   The canonical model is inventory events, not a mutable blob.

2. AI never writes directly to truth.
   Model output creates proposed changes that can be auto-accepted only above strong confidence thresholds.

3. Evidence must be retained.
   Every scan result should link to its source images, model outputs, confidence, and user actions.

4. The product must be actionable.
   Inventory data should always feed use-soon, shopping, and recipe workflows.

## Key Domains

### Identity

- users
- households
- memberships
- invitations

### Inventory

- storage locations
- inventory items
- inventory events
- consumption signals
- freshness estimates

### Scan Intelligence

- scans
- scan images
- model outputs
- scan proposals
- corrections

### Planning

- shopping lists
- shopping list items
- recipe suggestions
- staple rules

## Scan Pipeline

1. Client uploads one or more images to object storage using a signed upload flow.
2. Client creates a scan referencing the uploaded images and desired location.
3. Backend enqueues a scan job.
4. Worker performs:
   - image quality check
   - OCR / packaging text extraction
   - vision detection
   - candidate normalization
   - dedupe against household history
   - confidence scoring
   - proposal generation
5. Client polls or subscribes for scan completion.
6. User reviews and confirms proposed inventory changes.
7. Confirmation writes inventory events.

## Trust Model

Rules:

- low-confidence detections remain suggestions
- freshness is shown as estimate, not certainty
- duplicate resolution is visible to the user
- every committed change has a source

Suggested confidence policy:

- `>= 0.92`: allow default-checked proposals
- `0.75 - 0.91`: require review
- `< 0.75`: hold back or show as uncertain

## Product Surfaces

### Home

- summary of inventory health
- use-soon queue
- shopping list summary
- recipe suggestions

### Inventory

- grouped by location and category
- quantity and freshness state
- last-seen and source information

### Scan Review

- detected items
- confidence and evidence
- edit, merge, reject, or confirm actions

### Shopping

- auto-generated and manual items
- staple-aware prioritization
- shareable household state

### Cook Tonight

- recipes ranked by ingredient match, spoilage reduction, and time

## Recommended Tech Stack

- Next.js
- TypeScript
- Prisma
- Postgres
- Redis
- S3-compatible storage
- Sentry
- PostHog

## Rollout Plan

### Phase 1

- auth and households
- inventory schema
- scan upload flow
- async scan jobs
- scan review
- manual inventory CRUD

### Phase 2

- barcode support
- receipt import
- use-soon queue
- shopping list intelligence
- recipe suggestions

### Phase 3

- staple prediction
- retailer integrations
- premium subscription
- savings and waste insights
