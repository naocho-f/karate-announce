/**
 * PostCSS plugin: @layer をアンラップして中身だけ残す。
 * Chrome < 99 は @layer 未対応で内部の全ルールを無視するため、
 * アンラップすることで古いブラウザでもユーティリティクラスが適用される。
 *
 * Tailwind CSS 4 のレイヤー順 (theme → base → components → utilities) は
 * 出力順と一致するため、アンラップしても優先度は同じ。
 */
const plugin = () => ({
  postcssPlugin: "postcss-unwrap-layer",
  AtRule: {
    layer(atRule) {
      if (atRule.nodes && atRule.nodes.length > 0) {
        atRule.replaceWith(atRule.nodes);
      } else {
        atRule.remove();
      }
    },
  },
});
plugin.postcss = true;
export default plugin;
