import { loadSourceLock } from './reference-sources.mjs';

// Curated interpretation of the two statements in the same released html.rm spec.
// Keep the upstream policy, response schemas, and input hashes unchanged.
const CLI_REVISION = 'd564a63bbd8ec2dd4305a40a64fe0179ca9c667f';
const HTML_DELETE_NOTES = {
  en: 'Bot policy and response schema are separate. Bots must not invoke this deletion operation. The `200 Deleted` response schema records a possible service response; it does not grant Bot permission or prove which credentials can obtain that response. The pinned HTML specification does not establish that Bot requests always return HTTP 403, and HTML-service enforcement has not been verified here. If `bot_delete_forbidden` is returned, stop without retrying or changing identity/Space. Ask a human with document admin permission to delete in Octo; do not use another endpoint as a workaround.',
  zh: 'Bot 使用政策与响应 schema 是两回事。Bot 不得调用此删除操作。`200 Deleted` 响应 schema 记录一种可能的服务响应，不授予 Bot 删除权限，也不证明哪些凭据能够得到该响应。固定的 HTML 规范不能证明 Bot 请求必定返回 HTTP 403；本文未验证 HTML 服务的实际执行限制。若返回 `bot_delete_forbidden`，应停止，不重试或切换身份/Space。请具备文档管理权限的人在 Octo 中删除，不得换接口绕过。',
};

export function operationNote(operationId, lang, revision) {
  if (operationId !== 'html.rm') return '';
  revision ??= loadSourceLock().sources.cli.revision;
  if (revision !== CLI_REVISION) throw new Error('Review html.rm policy/schema note against the new CLI source before generating');
  if (!HTML_DELETE_NOTES[lang]) throw new Error(`Missing html.rm note translation: ${lang}`);
  return `<Warning>\n  ${HTML_DELETE_NOTES[lang]}\n</Warning>\n`;
}
