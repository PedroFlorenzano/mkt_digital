export interface SocialPublishResult {
  success: boolean;
  postId?: string;
  error?: string;
}

export async function publishToInstagram(
  accessToken: string,
  profileId: string,
  content: string,
  imageUrl?: string | null
): Promise<SocialPublishResult> {
  try {
    if (imageUrl) {
      const containerRes = await fetch(
        `https://graph.facebook.com/v19.0/${profileId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: imageUrl,
            caption: content,
            access_token: accessToken,
          }),
        }
      );
      const container = await containerRes.json();

      if (container.error) {
        return { success: false, error: container.error.message };
      }

      const publishRes = await fetch(
        `https://graph.facebook.com/v19.0/${profileId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: container.id,
            access_token: accessToken,
          }),
        }
      );
      const published = await publishRes.json();

      if (published.error) {
        return { success: false, error: published.error.message };
      }

      return { success: true, postId: published.id };
    }

    return { success: false, error: "Instagram requer uma imagem para publicação" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}

export async function publishToFacebook(
  accessToken: string,
  pageId: string,
  content: string,
  imageUrl?: string | null
): Promise<SocialPublishResult> {
  try {
    const body: Record<string, string> = {
      message: content,
      access_token: accessToken,
    };

    let endpoint = `https://graph.facebook.com/v19.0/${pageId}/feed`;

    if (imageUrl) {
      body.url = imageUrl;
      endpoint = `https://graph.facebook.com/v19.0/${pageId}/photos`;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (data.error) {
      return { success: false, error: data.error.message };
    }

    return { success: true, postId: data.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}

export async function publishToLinkedin(
  accessToken: string,
  profileUrn: string,
  content: string,
  imageUrl?: string | null
): Promise<SocialPublishResult> {
  try {
    const shareContent: Record<string, unknown> = {
      author: profileUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: content },
          shareMediaCategory: imageUrl ? "IMAGE" : "NONE",
          ...(imageUrl && {
            media: [
              {
                status: "READY",
                originalUrl: imageUrl,
              },
            ],
          }),
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(shareContent),
    });
    const data = await res.json();

    if (data.status && data.status >= 400) {
      return { success: false, error: data.message || "Erro ao publicar no LinkedIn" };
    }

    return { success: true, postId: data.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}

export async function publishToWhatsapp(
  accessToken: string,
  phoneNumberId: string,
  content: string,
  imageUrl?: string | null
): Promise<SocialPublishResult> {
  try {
    const messageBody: Record<string, unknown> = imageUrl
      ? {
          messaging_product: "whatsapp",
          recipient_type: "broadcast",
          type: "image",
          image: {
            link: imageUrl,
            caption: content,
          },
        }
      : {
          messaging_product: "whatsapp",
          recipient_type: "broadcast",
          type: "text",
          text: { body: content },
        };

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messageBody),
      }
    );
    const data = await res.json();

    if (data.error) {
      return { success: false, error: data.error.message };
    }

    return { success: true, postId: data.messages?.[0]?.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}

export async function publishCarouselToInstagram(
  accessToken: string,
  profileId: string,
  caption: string,
  imageUrls: string[]
): Promise<SocialPublishResult> {
  try {
    // Upload each image as an individual carousel item container
    const containerIds: string[] = [];
    for (const imageUrl of imageUrls) {
      const itemRes = await fetch(
        `https://graph.facebook.com/v19.0/${profileId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: imageUrl,
            is_carousel_item: true,
            access_token: accessToken,
          }),
        }
      );
      const item = await itemRes.json();

      if (item.error) {
        return { success: false, error: item.error.message };
      }

      containerIds.push(item.id);
    }

    // Create the carousel album container
    const albumRes = await fetch(
      `https://graph.facebook.com/v19.0/${profileId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "CAROUSEL_ALBUM",
          children: containerIds.join(","),
          caption,
          access_token: accessToken,
        }),
      }
    );
    const album = await albumRes.json();

    if (album.error) {
      return { success: false, error: album.error.message };
    }

    // Publish the carousel
    const publishRes = await fetch(
      `https://graph.facebook.com/v19.0/${profileId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: album.id,
          access_token: accessToken,
        }),
      }
    );
    const published = await publishRes.json();

    if (published.error) {
      return { success: false, error: published.error.message };
    }

    return { success: true, postId: published.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}

export async function publishReelToInstagram(
  accessToken: string,
  profileId: string,
  caption: string,
  videoUrl: string
): Promise<SocialPublishResult> {
  try {
    // Create the Reel media container
    const containerRes = await fetch(
      `https://graph.facebook.com/v19.0/${profileId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "REELS",
          video_url: videoUrl,
          caption,
          access_token: accessToken,
        }),
      }
    );
    const container = await containerRes.json();

    if (container.error) {
      return { success: false, error: container.error.message };
    }

    // Publish the Reel
    const publishRes = await fetch(
      `https://graph.facebook.com/v19.0/${profileId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: container.id,
          access_token: accessToken,
        }),
      }
    );
    const published = await publishRes.json();

    if (published.error) {
      return { success: false, error: published.error.message };
    }

    return { success: true, postId: published.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}

export async function publishStoryToInstagram(
  accessToken: string,
  profileId: string,
  mediaUrl: string,
  mediaType: "IMAGE" | "VIDEO"
): Promise<SocialPublishResult> {
  try {
    const mediaBody =
      mediaType === "IMAGE"
        ? {
            media_type: "IMAGE",
            image_url: mediaUrl,
            is_stories: true,
            access_token: accessToken,
          }
        : {
            media_type: "VIDEO",
            video_url: mediaUrl,
            is_stories: true,
            access_token: accessToken,
          };

    // Create the Story media container
    const containerRes = await fetch(
      `https://graph.facebook.com/v19.0/${profileId}/media`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mediaBody),
      }
    );
    const container = await containerRes.json();

    if (container.error) {
      return { success: false, error: container.error.message };
    }

    // Publish the Story
    const publishRes = await fetch(
      `https://graph.facebook.com/v19.0/${profileId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creation_id: container.id,
          access_token: accessToken,
        }),
      }
    );
    const published = await publishRes.json();

    if (published.error) {
      return { success: false, error: published.error.message };
    }

    return { success: true, postId: published.id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erro desconhecido" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TikTok — Content Posting API
// Base URL: https://open.tiktokapis.com/v2
//
// ⚠️  Requires app approval from TikTok Developer Portal with scope
//     video.publish.  Unapproved apps post in PRIVATE mode only.
//
// Two modes supported:
//   publishVideoToTikTok  — video (15–60s Reels-style)
//   publishPhotoToTikTok  — photo carousel (1–35 images)
// ─────────────────────────────────────────────────────────────────────────────

const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";

export type TikTokPrivacyLevel =
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "SELF_ONLY";

export interface TikTokPublishOptions {
  privacyLevel?: TikTokPrivacyLevel;
  disableComment?: boolean;
  disableDuet?: boolean;
  disableStitch?: boolean;
}

/**
 * Publishes a video to TikTok using the Content Posting API (PULL_FROM_URL).
 * The video file must be publicly accessible.
 *
 * TikTok fetches the video from `videoUrl`, processes it, and publishes it.
 * Returns the publish_id which can be used to poll `/v2/post/publish/status/fetch/`.
 */
export async function publishVideoToTikTok(
  accessToken: string,
  title: string,
  videoUrl: string,
  options: TikTokPublishOptions = {},
): Promise<SocialPublishResult> {
  const {
    privacyLevel = "PUBLIC_TO_EVERYONE",
    disableComment = false,
    disableDuet = false,
    disableStitch = false,
  } = options;

  try {
    const res = await fetch(
      `${TIKTOK_API_BASE}/post/publish/video/init/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          post_info: {
            title: title.slice(0, 150), // TikTok title max 150 chars
            privacy_level: privacyLevel,
            disable_comment: disableComment,
            disable_duet: disableDuet,
            disable_stitch: disableStitch,
            video_cover_timestamp_ms: 1000,
          },
          source_info: {
            source: "PULL_FROM_URL",
            video_url: videoUrl,
          },
        }),
      },
    );

    const data = (await res.json()) as {
      data?: { publish_id?: string };
      error?: { code?: string; message?: string };
    };

    if (!res.ok || data.error?.code !== "ok") {
      const msg = data.error?.message ?? `HTTP ${res.status}`;
      return { success: false, error: `TikTok: ${msg}` };
    }

    return { success: true, postId: data.data?.publish_id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro desconhecido ao publicar no TikTok",
    };
  }
}

/**
 * Publishes a photo carousel to TikTok using the Content Posting API.
 * Each image must be a publicly accessible URL.
 * TikTok supports 1–35 images per photo post.
 */
export async function publishPhotoToTikTok(
  accessToken: string,
  description: string,
  imageUrls: string[],
  options: TikTokPublishOptions = {},
): Promise<SocialPublishResult> {
  const {
    privacyLevel = "PUBLIC_TO_EVERYONE",
    disableComment = false,
  } = options;

  if (imageUrls.length === 0) {
    return { success: false, error: "É necessário ao menos 1 imagem para post no TikTok" };
  }

  try {
    const res = await fetch(
      `${TIKTOK_API_BASE}/post/publish/content/init/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          post_info: {
            title: description.slice(0, 150),
            description: description.slice(0, 2200),
            privacy_level: privacyLevel,
            disable_comment: disableComment,
            auto_add_music: true,
            photo_cover_index: 1,
          },
          source_info: {
            source: "PULL_FROM_URL",
            photo_images: imageUrls.slice(0, 35), // max 35
            photo_cover_index: 1,
          },
          post_mode: "DIRECT_POST",
          media_type: "PHOTO",
        }),
      },
    );

    const data = (await res.json()) as {
      data?: { publish_id?: string };
      error?: { code?: string; message?: string };
    };

    if (!res.ok || data.error?.code !== "ok") {
      const msg = data.error?.message ?? `HTTP ${res.status}`;
      return { success: false, error: `TikTok: ${msg}` };
    }

    return { success: true, postId: data.data?.publish_id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro desconhecido ao publicar no TikTok",
    };
  }
}
