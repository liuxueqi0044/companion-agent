import { createApp, h, type CSSProperties } from "vue";

const styles: Record<string, CSSProperties> = {
  shell: {
    display: "flex",
    flexDirection: "column",
    minHeight: "100vh",
  },
  header: {
    padding: "24px 32px",
    borderBottom: "1px solid #e3e6ea",
    background: "#ffffff",
  },
  title: {
    margin: 0,
    fontSize: "20px",
    fontWeight: 600,
  },
  subtitle: {
    margin: "6px 0 0",
    fontSize: "13px",
    color: "#57606a",
  },
  main: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "32px",
  },
  placeholder: {
    width: "100%",
    maxWidth: "480px",
    padding: "28px",
    border: "1px dashed #c6cdd5",
    borderRadius: "8px",
    background: "#ffffff",
    textAlign: "center",
  },
  placeholderTitle: {
    margin: 0,
    fontSize: "16px",
    fontWeight: 600,
    color: "#57606a",
  },
  placeholderText: {
    margin: "10px 0 0",
    fontSize: "13px",
    lineHeight: 1.6,
    color: "#6e7781",
  },
  footer: {
    padding: "16px 32px",
    borderTop: "1px solid #e3e6ea",
    background: "#ffffff",
  },
  footerText: {
    margin: 0,
    fontSize: "12px",
    color: "#6e7781",
  },
};

function AppShell() {
  return h("div", { style: styles.shell }, [
    h("header", { style: styles.header }, [
      h("h1", { style: styles.title }, "Companion Agent"),
      h(
        "p",
        { style: styles.subtitle },
        "桌面空壳（M00.0.03）：只建立构建入口与界面骨架，未实现托盘、认证与任务流程。",
      ),
    ]),
    h("main", { style: styles.main }, [
      h("section", { style: styles.placeholder }, [
        h("h2", { style: styles.placeholderTitle }, "暂无数据"),
        h(
          "p",
          { style: styles.placeholderText },
          "此处将显示任务与执行记录。当前为空壳，不加载任何真实用户数据，也不连接任何远端服务。",
        ),
      ]),
    ]),
    h("footer", { style: styles.footer }, [
      h(
        "p",
        { style: styles.footerText },
        "本地开发：仓库根执行 npm run build（Vite 产物输出到 apps/desktop/dist），或以 npm run dev --workspace @companion/desktop 在 127.0.0.1 本机预览。",
      ),
    ]),
  ]);
}

const App = { name: "CompanionAgentShell", render: AppShell };

createApp(App).mount("#app");
