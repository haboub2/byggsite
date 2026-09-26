import "server-only";
import { featuredProjects } from "./placeholder";
import { hasImage } from "./images";

/** The projects section is only linked once at least one project has real
 *  photos in public/images/. Stock photos never stand in for our own work. */
export function projectsReady(): boolean {
  return featuredProjects.some((p) => hasImage(p.image));
}
