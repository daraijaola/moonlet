import * as store from "./store";
import * as tg from "./connections/telegram";
import * as discord from "./connections/discord";
import type { FileSink } from "./tools";

/** Files a moonlet writes: kept on the run, and a copy pushed to the owner's Telegram when it is linked. */
export function fileSink(ctx: { owner: string; moonletId: string; runId: string | null; chatId?: string; discordWebhook?: string; replyTo?: number; fetch?: typeof fetch }): FileSink {
  return async (file) => {
    const meta = await store.saveFile({ owner: ctx.owner, moonletId: ctx.moonletId, runId: ctx.runId, name: file.name, mime: file.mime, bytes: file.bytes });
    const sentTo: string[] = ["moonlet page"];
    if (ctx.chatId && tg.telegramConfigured()) {
      const sent = await tg.sendDocument(ctx.chatId, { ...file, caption: `<b>${tg.esc(file.caption)}</b>`, replyTo: ctx.replyTo }, ctx.fetch).catch((e) => {
        console.error("telegram sendDocument", (e as Error).message);
        return null;
      });
      if (sent) {
        sentTo.push("telegram");
        await store.rememberTelegramMessage(ctx.chatId, Number(sent.id), ctx.moonletId, ctx.runId).catch(() => undefined);
      }
    }
    if (ctx.discordWebhook) {
      const ok = await discord.postFile(ctx.discordWebhook, file, ctx.fetch).then(() => true, (e) => {
        console.error("discord sendFile", (e as Error).message);
        return false;
      });
      if (ok) sentTo.push("discord");
    }
    return { ok: true, id: meta.id, sentTo };
  };
}
