/**
 * 編集コマンドの登録簿。
 *
 * 将来の機能追加はここに register() で足すだけで、
 * ツールメニューへの表示とキー割り当てが自動で付いてくる。
 *
 * コマンドは ctx（EditorContext）を受け取る。ctx の形は src/ui/context.js を参照。
 *   - 純粋なテキスト変換なら transform() を使うと選択範囲の扱いまで面倒を見る
 *   - それ以外は run() で ctx を直接操作する
 */

const commands = new Map();

/** label は i18n のキー。辞書に無ければそのまま表示されるので、外部拡張は生の文字列でもよい。 */
export const GROUPS = [
  { id: 'text', label: 'group.text' },
  { id: 'line', label: 'group.line' },
  { id: 'json', label: 'group.json' },
  { id: 'file', label: 'group.file' },
];

/**
 * コマンドを登録する。
 * @param {object} cmd
 * @param {string} cmd.id      一意な ID
 * @param {string} cmd.label   メニューに出す名前（i18n のキー、または生の文字列）
 * @param {string} cmd.group   GROUPS の id
 * @param {string} [cmd.hint]  補足説明
 * @param {(ctx:object)=>void|Promise<void>} [cmd.run]
 * @param {(text:string, ctx:object)=>string} [cmd.transform] テキスト全体を変換する
 * @param {(text:string)=>string} [cmd.lineTransform] 選択行（無選択なら全文）を変換する
 */
export function register(cmd) {
  if (!cmd?.id) throw new Error('a command needs an id');
  if (commands.has(cmd.id)) throw new Error(`duplicate command id: ${cmd.id}`);
  commands.set(cmd.id, cmd);
  return cmd;
}

export function getCommand(id) {
  return commands.get(id);
}

export function listCommands() {
  return [...commands.values()];
}

/** グループごとに並べ替えて返す（メニュー描画用）。 */
export function listByGroup() {
  return GROUPS.map((g) => ({
    ...g,
    commands: listCommands().filter((c) => c.group === g.id),
  })).filter((g) => g.commands.length > 0);
}

/** コマンドを実行する。transform / lineTransform は共通処理でくるむ。 */
export async function runCommand(id, ctx) {
  const cmd = commands.get(id);
  if (!cmd) throw new Error(`unknown command: ${id}`);

  if (cmd.lineTransform) {
    ctx.applyToSelectedLines(cmd.lineTransform, cmd.label);
    return;
  }
  if (cmd.transform) {
    const before = ctx.getText();
    const after = cmd.transform(before, ctx);
    if (after !== before) ctx.setText(after, { label: cmd.label });
    return;
  }
  await cmd.run(ctx);
}
