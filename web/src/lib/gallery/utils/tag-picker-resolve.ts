import { handleError } from '#lib/utils/handle-error.ts';
import { getFormatter } from '#lib/utils/i18n.ts';
import { upsertTags, type TagResponseDto } from '@immich/sdk';

/**
The tag picker (`$lib/modals/AssetTagModal.svelte`) lists `GET /tags`, which includes other users' tags the caller sees
through a space, but `PUT /tags/assets` only applies tags the caller owns (specs/2026-11-28-tag-picker-visible-tags-design.md).
So every picked tag is resolved by its value into the caller's own namespace first, exactly as the picker already does
for a typed name: one `PUT /tags` upsert of all picked values, whose ids are then used for tagging. The caller's own
tags come back with their own ids; a value the caller does not hold yet is created, hierarchy included.

Returns undefined, after showing the error, when the upsert fails, so the caller tags nothing.
*/
export const resolvePickedTagIds = async (
  tagIds: string[],
  tagsById: Record<string, Pick<TagResponseDto, 'value'> | undefined>,
): Promise<string[] | undefined> => {
  const values = [...new Set(tagIds.map((id) => tagsById[id]?.value).filter((value) => value !== undefined))];
  if (values.length === 0) {
    return undefined;
  }

  try {
    const tags = await upsertTags({ tagUpsertDto: { tags: values } });
    return tags.map(({ id }) => id);
  } catch (error) {
    const $t = await getFormatter();
    handleError(error, $t('errors.failed_to_tag_assets'));
    return undefined;
  }
};
