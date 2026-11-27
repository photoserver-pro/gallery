import { resolvePickedTagIds } from '#lib/gallery/utils/tag-picker-resolve.ts';
import { handleError } from '#lib/utils/handle-error.ts';
import { upsertTags, type TagResponseDto } from '@immich/sdk';

vi.mock('@immich/sdk', async (original) => ({
  ...(await original<typeof import('@immich/sdk')>()),
  upsertTags: vi.fn(),
}));
vi.mock('#lib/utils/handle-error.ts', () => ({ handleError: vi.fn() }));

const tag = (id: string, value: string) => ({ id, value }) as TagResponseDto;

describe('resolvePickedTagIds', () => {
  beforeEach(() => {
    vi.mocked(upsertTags).mockReset();
    vi.mocked(handleError).mockReset();
  });

  it("resolves another member's tag into the caller's own tag of the same value", async () => {
    vi.mocked(upsertTags).mockResolvedValue([tag('own-wedding', 'Wedding')]);

    await expect(
      resolvePickedTagIds(['foreign-wedding'], { 'foreign-wedding': { value: 'Wedding' } }),
    ).resolves.toEqual(['own-wedding']);
    expect(upsertTags).toHaveBeenCalledWith({ tagUpsertDto: { tags: ['Wedding'] } });
  });

  it("keeps the caller's own tag id, which the upsert returns unchanged", async () => {
    vi.mocked(upsertTags).mockResolvedValue([tag('own-1', 'Holiday')]);

    await expect(resolvePickedTagIds(['own-1'], { 'own-1': { value: 'Holiday' } })).resolves.toEqual(['own-1']);
  });

  it('sends hierarchy values exactly as they are, once each, in one call', async () => {
    vi.mocked(upsertTags).mockResolvedValue([tag('own-c', 'a/b/c'), tag('own-x', 'x')]);

    await resolvePickedTagIds(['foreign-c', 'own-x', 'other-c'], {
      'foreign-c': { value: 'a/b/c' },
      'own-x': { value: 'x' },
      'other-c': { value: 'a/b/c' },
    });

    expect(upsertTags).toHaveBeenCalledExactlyOnceWith({ tagUpsertDto: { tags: ['a/b/c', 'x'] } });
  });

  it('shows the error and resolves nothing when the upsert fails', async () => {
    const error = new Error('boom');
    vi.mocked(upsertTags).mockRejectedValue(error);

    await expect(resolvePickedTagIds(['t'], { t: { value: 'Wedding' } })).resolves.toBeUndefined();
    expect(handleError).toHaveBeenCalledWith(error, expect.any(String));
  });

  it('calls nothing when no picked id has a known value', async () => {
    await expect(resolvePickedTagIds(['unknown'], {})).resolves.toBeUndefined();
    expect(upsertTags).not.toHaveBeenCalled();
  });
});
