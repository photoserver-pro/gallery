import AssetTagModal from '#lib/modals/AssetTagModal.svelte';
import { handleTagAssets } from '#lib/services/asset.service.ts';
import { handleError } from '#lib/utils/handle-error.ts';
import { renderWithTooltips } from '#test/unit/helpers.ts';
import { getAllTags, upsertTags, type TagResponseDto } from '@immich/sdk';
import { page, userEvent } from 'vitest/browser';

// Fork test of the upstream picker (specs/2026-11-28-tag-picker-visible-tags-design.md): every picked tag is
// resolved by its value into the caller's own namespace before tagging.
vi.mock('@immich/sdk', async (original) => ({
  ...(await original<typeof import('@immich/sdk')>()),
  getAllTags: vi.fn(),
  upsertTags: vi.fn(),
}));
vi.mock('#lib/services/asset.service.ts', () => ({ handleTagAssets: vi.fn() }));
vi.mock('#lib/utils/handle-error.ts', () => ({ handleError: vi.fn() }));

const tag = (id: string, value: string) => ({ id, value, name: value.split('/').at(-1) }) as TagResponseDto;

const field = () => page.getByRole('combobox');
const openDropdown = async () => {
  (field().element() as HTMLElement).focus();
  await expect.element(page.getByRole('listbox')).toBeInTheDocument();
};
// The global test setup renders literal translation keys.
const submit = () => userEvent.click(page.getByRole('button', { name: 'tag_assets' }));

describe('AssetTagModal (Gallery)', () => {
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onClose = vi.fn();
    vi.mocked(getAllTags).mockReset();
    vi.mocked(upsertTags).mockReset();
    vi.mocked(handleTagAssets).mockReset().mockResolvedValue(true);
    vi.mocked(handleError).mockReset();
  });

  const renderModal = async (tags: TagResponseDto[]) => {
    vi.mocked(getAllTags).mockResolvedValue(tags);
    await renderWithTooltips(AssetTagModal, { onClose, assetIds: ['asset-1'] });
    await vi.waitFor(() => expect(getAllTags).toHaveBeenCalled());
    await openDropdown();
  };

  it("tags with the caller's own tag when another member's tag is picked", async () => {
    await renderModal([tag('foreign-wedding', 'Wedding')]);
    vi.mocked(upsertTags).mockResolvedValue([tag('own-wedding', 'Wedding')]);

    await userEvent.click(page.getByRole('option', { name: 'Wedding' }));
    await submit();

    await vi.waitFor(() => expect(handleTagAssets).toHaveBeenCalledWith(['asset-1'], ['own-wedding']));
    expect(upsertTags).toHaveBeenCalledWith({ tagUpsertDto: { tags: ['Wedding'] } });
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it("tags with the same id when the caller's own tag is picked", async () => {
    await renderModal([tag('own-1', 'Holiday')]);
    vi.mocked(upsertTags).mockResolvedValue([tag('own-1', 'Holiday')]);

    await userEvent.click(page.getByRole('option', { name: 'Holiday' }));
    await submit();

    await vi.waitFor(() => expect(handleTagAssets).toHaveBeenCalledWith(['asset-1'], ['own-1']));
  });

  it('keeps a hierarchy value exactly as it is', async () => {
    await renderModal([tag('foreign-c', 'Events/2026/Summer')]);
    vi.mocked(upsertTags).mockResolvedValue([tag('own-c', 'Events/2026/Summer')]);

    await userEvent.click(page.getByRole('option', { name: 'Events/2026/Summer' }));
    await submit();

    await vi.waitFor(() => expect(handleTagAssets).toHaveBeenCalledWith(['asset-1'], ['own-c']));
    expect(upsertTags).toHaveBeenCalledWith({ tagUpsertDto: { tags: ['Events/2026/Summer'] } });
  });

  it('still creates a typed name in the caller namespace and tags with it', async () => {
    await renderModal([]);
    vi.mocked(upsertTags).mockResolvedValue([tag('own-new', 'Ski trip')]);

    await userEvent.type(field(), 'Ski trip');
    await userEvent.click(page.getByRole('option', { name: 'Ski trip' }));
    await expect.element(page.getByText('Ski trip')).toBeInTheDocument();
    await submit();

    await vi.waitFor(() => expect(handleTagAssets).toHaveBeenCalledWith(['asset-1'], ['own-new']));
  });

  it('tags nothing and keeps the modal open when resolving the picked tags fails', async () => {
    await renderModal([tag('foreign-wedding', 'Wedding')]);
    vi.mocked(upsertTags).mockRejectedValue(new Error('boom'));

    await userEvent.click(page.getByRole('option', { name: 'Wedding' }));
    await submit();

    await vi.waitFor(() => expect(handleError).toHaveBeenCalled());
    expect(handleTagAssets).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
