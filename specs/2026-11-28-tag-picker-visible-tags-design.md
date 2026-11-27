# Any tag the picker offers can be used

Status: design, 2026-11-28. Base: `main` at `94f05b13f3c`; every path and line below refers to that commit. Upstream
reference: Immich `v3.4.2` (`branding/config.json` `upstream.version`), diffs measured against `refs/upstream/v3.4.2`.

## Summary

The web tag picker offers other users' tags the caller sees through a space, but tagging with one of them does
nothing: the server applies only tags the caller owns. The picker now resolves every picked tag by its value into the
caller's own namespace before tagging, exactly as it already does for a typed name. Web only, one fork helper, no
server, API, permission or data change.

## Problem

1. **The picker lists tags the caller cannot use.** `AssetTagModal.svelte:25-27` loads `GET /tags`
   (`TagService.getAll`, `server/src/services/tag.service.ts:26-29`), which returns the caller's tags plus every tag on
   an asset the caller sees through a space (#647, `TagRepository.getAll` and `ownedOrSpaceAccessible`,
   `server/src/repositories/tag.repository.ts:72-94`). The options carry the tag id (`AssetTagModal.svelte:74`).
2. **Picking such a tag tags nothing.** A picked option adds its id (`AssetTagModal.svelte:44-45`), and submit sends the
   ids to `PUT /tags/assets` (`:34`, `handleTagAssets`, `web/src/lib/services/asset.service.ts:569-581`).
   `TagService.bulkTagAssets` keeps only tag ids that pass `Permission.TagAsset` (`tag.service.ts:96`), which is
   tag-owner only (`server/src/utils/access.ts:339-343`), so a picked foreign tag is dropped and the request answers 200
   with `count: 0`.
3. **A typed name works.** An entry with no matching option is upserted into the caller's namespace first
   (`AssetTagModal.svelte:47-49`, `PUT /tags` → `TagService.upsert`, `tag.service.ts:81-84`) and tagged with the
   returned id.

Since #1344 a tag a space editor puts on a member's asset stays the editor's and stays out of the owner's metadata
(`server/src/repositories/asset.repository.ts:1464-1475`, `server/src/gallery/utils/asset-owner-tags.ts`), so tagging
with the caller's own tag is the intended shape.

## Goals and non-goals

Goals:

1. A space editor who picks a tag another member owns gets the assets tagged with their own tag of the same value.
2. An owner who picks a value held only by another user gets their own tag of that value.
3. Picking one's own tag tags with the same id and creates no tag.
4. Hierarchy values (`a/b/c`) keep their exact value.
5. If resolving fails, nothing is tagged and the existing error toast is shown.

Non-goals:

- Removing tags (by the asset owner or by editors).
- Matching a name across users in search or filters.
- Mobile. Its picker lists `GET /tags` too (`mobile/lib/data/store/tag.dart:28-35`), but the app tags only assets
  the caller owns (`mobile/lib/presentation/actions/tag.action.dart:19`); the same resolution there is a later slice.

## Current state

| Step           | Code                                                                                   | Behaviour                                                                                 |
| -------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Picker options | `AssetTagModal.svelte:25-27`, `:74`                                                    | `GET /tags`: own tags plus space-visible tags of others, by id                            |
| Pick existing  | `AssetTagModal.svelte:44-45`                                                           | adds the option's id                                                                      |
| Type new       | `AssetTagModal.svelte:47-49`                                                           | `PUT /tags` upsert into the caller's namespace, adds its id                               |
| Submit         | `AssetTagModal.svelte:29-37` → `handleTagAssets`                                       | `PUT /tags/assets` with the selected ids                                                  |
| Server         | `tag.service.ts:94-114`                                                                | applies only tags the caller owns                                                         |
| Upsert         | `upsertTags`, `server/src/utils/tag.ts:5-25`; `upsertValue`, `tag.repository.ts:60-69` | per path segment, `ON CONFLICT (userId, value) DO UPDATE SET parentId`; existing ids kept |

Every web path that tags assets opens this modal: the selection toolbar (`web/src/lib/gallery/asset-actions.ts:127`),
upstream's bulk action (`asset.service.ts:131`) and the asset viewer's Tag action, used by the detail panel's add-tag
button (`asset.service.ts:334`). The workflow step picker `SchemaTagPicker.svelte` also lists `GET /tags`, but it
configures a workflow, not a tagging request, and is out of scope.

## Options considered

1. **Resolve in the web, by value, before tagging (chosen).** Reuses the path a typed name already takes, so the
   result is exactly what the user gets by typing the same name. No server or API change, nothing for old apps, stock
   clients or a switch back to consider, and the upstream modal changes by an import and one call.
2. **Resolve in `TagService.bulkTagAssets`.** Every client would benefit, but the server would create tags in the
   caller's namespace from ids of other users' tags, a new server behaviour for an upstream endpoint that would need
   its own access rules (which foreign ids may be resolved) and changes to an upstream method body. Worth revisiting
   with the mobile slice (open question 1).
3. **Status quo.** The picker keeps offering tags that silently do nothing (#1358 at least reports them as skipped).
   Rejected.

## Design

`web/src/lib/gallery/utils/tag-picker-resolve.ts` exports `resolvePickedTagIds(tagIds, tagsById)`:

1. Maps every selected id to its tag value through the picker's own `tagMap` and drops duplicates.
2. Calls `upsertTags({ tagUpsertDto: { tags: values } })` once for all values.
3. Returns the returned ids. On failure it calls `handleError` with the existing `errors.failed_to_tag_assets` message
   and returns `undefined`.

`AssetTagModal.svelte` `onSubmit` calls it before `handleTagAssets` and tags only when it returned ids:

```ts
const tagIds = await resolvePickedTagIds([...selectedIds], tagMap);
if (tagIds && (await handleTagAssets(assetIds, tagIds))) {
```

The selection and `allTags` are not rewritten: on success the modal closes, on failure it stays open with the same
selection, and the next submit resolves again. Typed names keep upstream's upsert at selection time; they are
upserted a second time at submit, which returns the same id.

Effects to know:

- A picked value the caller did not hold yet now appears in the caller's own tag list, as a typed name does today.
- Upserting a value the caller already holds keeps its id but rewrites its `parentId` to the same parent and so moves
  its `updatedAt` (`upsertValue`'s `DO UPDATE`, `tag.table.ts:16` `UpdatedAtTrigger`). Upstream's typed-name path has
  the same effect.
- One more request per submit (`PUT /tags`), for all selected values together.

No new strings.

## Authorization

No change. The upsert creates tags only in the caller's own namespace (`TagService.upsert` uses `auth.user.id`), the
tagging request goes through the unchanged `bulkTagAssets` checks, and the web never sends another user's tag id to a
write endpoint any more. No decision is added or widened, so there is nothing for an enumerating matrix (AGENTS.md
rule 7) to cover.

## Compatibility

| Pairing                     | What it sees                                                                    |
| --------------------------- | ------------------------------------------------------------------------------- |
| Web, any                    | same version as the server (`server/src/repositories/config.repository.ts:246`) |
| Old Gallery app, new server | unchanged (no server change)                                                    |
| New web, old server         | not possible; the server serves the web                                         |
| Mobile app                  | unchanged; a picked foreign tag is still dropped there (non-goal)               |
| Stock Immich app or server  | unchanged; written tags are ordinary per-user `tag` / `tag_asset` rows          |

## Upstream impact

| File                                      | Base vs tag | With this change | What changes                                |
| ----------------------------------------- | ----------- | ---------------- | ------------------------------------------- |
| `web/src/lib/modals/AssetTagModal.svelte` | identical   | +3 / −1          | one import, the resolve call before tagging |

New fork files: `web/src/lib/gallery/utils/tag-picker-resolve.ts` and its spec, and
`web/src/lib/modals/AssetTagModal.gallery.spec.ts` (AGENTS.md rule 8).

## Switch-back

Nothing is stored beyond ordinary tags in the caller's namespace, which a stock Immich server serves as they are.

## Testing

- Unit (`tag-picker-resolve.spec.ts`): a foreign tag resolves to the caller's own id; the caller's own tag keeps its
  id; hierarchy values are sent exactly and once each, in one call; an upsert failure shows the error and resolves
  nothing; no known value calls nothing.
- Component (`AssetTagModal.gallery.spec.ts`): foreign pick tags with the caller's own id and closes; own pick tags
  with the same id; hierarchy value kept; typed name still created and used; upsert failure tags nothing and keeps the
  modal open.
- No web e2e: the case needs two users, a space and a tag on a shared asset driven through the picker, and the web e2e
  suite has no tagging journey to extend; the server side is unchanged and covered by its existing tests.

## Open questions

1. For the mobile slice: repeat this resolution in the app, or let the server resolve foreign ids itself (option 2)
   so every client gets it at once?
