export async function localReply({ message, memoryText, historyText, settings }) {
  const memory = memoryText ? `\n\n我还记得我们之前聊过的事。` : '';
  const recent = historyText.split('\n').filter(Boolean).slice(-6).join('\n');

  return {
    content:
      `嗯，我在听。你说的是：“${message}”${memory}\n\n` +
      (recent
        ? `当前对话里我看到了这些：\n${recent}\n\n`
        : '') +
      `这是本地演示模式，不消耗任何模型额度。等你配置好 Claude 后，我会在这里真正读懂你。`,
    reasoningContent: null,
  };
}
