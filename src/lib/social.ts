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
