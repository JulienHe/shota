/** Common capture sizes, in pixels, for the bar's size menu. Names are the
 *  sizes' own (brands, resolutions), so they are not translated. */
export interface SizePreset {
  name: string;
  width: number;
  height: number;
}

export interface SizePresetGroup {
  /** Translation key of the group's heading. */
  title: string;
  presets: SizePreset[];
}

export const SIZE_PRESET_GROUPS: SizePresetGroup[] = [
  {
    title: "overlay.presetSocial",
    presets: [
      { name: "X (Twitter) post", width: 1200, height: 675 },
      { name: "X (Twitter) header", width: 1500, height: 500 },
      { name: "Facebook post", width: 1200, height: 630 },
      { name: "Facebook cover", width: 820, height: 312 },
      { name: "Instagram post", width: 1080, height: 1350 },
      { name: "Instagram story", width: 1080, height: 1920 },
      { name: "LinkedIn cover", width: 1584, height: 396 },
    ],
  },
  {
    title: "overlay.presetScreen",
    presets: [
      { name: "1:1", width: 1080, height: 1080 },
      { name: "4:3", width: 1024, height: 768 },
      { name: "16:9 HD", width: 1280, height: 720 },
      { name: "16:9 Full HD", width: 1920, height: 1080 },
      { name: "9:16", width: 1080, height: 1920 },
    ],
  },
];
