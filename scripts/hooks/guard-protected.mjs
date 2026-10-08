// Kiro PreToolUse hook. Exit 2 = block the tool call. Fail-open on anything unexpected (never wedge the agent).
// Protected: secrets, golden fixtures, architect-owned contract files, and the .kiro rules themselves.
let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(raw || "{}");
    const tool = String(data.tool_name ?? data.toolName ?? data.tool ?? "");
    const input = JSON.stringify(data.tool_input ?? data.toolInput ?? data.input ?? data).replace(/\\+/g, "/"); // Windows paths: src\\model -> src/model
    if (/read|list|search|grep|glob|find|view/i.test(tool)) process.exit(0);
    const isShell = /shell|bash|command|terminal|powershell|exec/i.test(tool);
    if (isShell && !/(Set-Content|Out-File|Add-Content|Remove-Item|Move-Item|Copy-Item|New-Item|\brm\b|\bdel\b|\bmv\b|\bcp\b|sed -i|writeFile|>)/i.test(input)) process.exit(0);
    const protectedPaths = [
      /(^|[\/"'\s])\.env(?!\.example)(\.[a-z]+)?\b/i,
      /fixtures\/golden\//,
      /src\/model\//,
      /src\/ports\.ts/,
      /src\/registry\/types\.ts/,
      /src\/store\/memory\.ts/,
      /contract\.sha256\.json/,
      /\.kiro\/(steering|hooks)\//,
      /crew\/overnight-[^"']*\.md/,
      /\.kiro\/specs\/[^"']*\/(requirements|design)\.md/, // tasks.md stays writable: Kiro ticks task checkboxes there
      /scripts\/(hooks\/|check-|verify\.mjs)/,
    ];
    const hit = protectedPaths.find((re) => re.test(input));
    if (hit) {
      console.error(
        `BLOCKED by guard-protected: this path is architect-owned or secret (${hit}). ` +
          "Do not edit it. If you believe it is wrong, write BLOCKED.md (what, why, evidence) and stop.",
      );
      process.exit(2);
    }
    process.exit(0);
  } catch {
    process.exit(0);
  }
});
