/**
 * Placeholder photography. AI image generation is blocked (Cloudinary
 * generation quota exhausted, needs a plan upgrade) — using themed,
 * royalty-free Unsplash photos as a stand-in until either real project
 * photos exist or generation is available again. Swap freely; nothing
 * else in the app depends on these specific URLs.
 */
function unsplash(id: string, w: number) {
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=75`;
}

export const images = {
  byggHeroKitchen: unsplash("1610733374054-59454fe657cd", 1200),
  projectKitchen: unsplash("1643034738686-d69e7bc047e1", 900),
  projectBathroom: unsplash("1696987007764-7f8b85dd3033", 900),
  projectLivingRoom: unsplash("1583847268964-b28dc8f51f92", 900),
  softwareHeroWorkspace: unsplash("1623479322729-28b25c16b011", 1200),
  dashboardScreen: unsplash("1551288049-bebda4e38f71", 900),
};
