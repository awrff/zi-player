import type { ThemeConfig } from "antd";

/** Ubuntu-flavoured Ant Design theme: aubergine/orange with translucent surfaces. */
export const theme: ThemeConfig = {
  token: {
    colorPrimary: "#e95420",
    colorInfo: "#e95420",
    colorBgBase: "#1b1018",
    colorTextBase: "#f5f5f7",
    colorBgContainer: "rgba(255,255,255,0.08)",
    colorBgElevated: "rgba(40,26,36,0.92)",
    colorBorder: "rgba(255,255,255,0.16)",
    colorBorderSecondary: "rgba(255,255,255,0.1)",
    borderRadius: 12,
    fontFamily:
      'Ubuntu, "Ubuntu Sans", "Segoe UI", system-ui, -apple-system, sans-serif',
  },
  components: {
    Modal: {
      contentBg: "rgba(40,26,36,0.92)",
      headerBg: "transparent",
    },
    Popconfirm: {
      colorBgElevated: "rgba(40,26,36,0.96)",
    },
    Slider: {
      railBg: "rgba(255,255,255,0.18)",
      railHoverBg: "rgba(255,255,255,0.24)",
    },
  },
};
