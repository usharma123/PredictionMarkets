export function HelpBar() {
  return (
    <box
      flexDirection="row"
      style={{
        width: "100%",
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: "#1E1E1E",
      }}
    >
      <text fg="#888888">
        <text fg="#ECF0F1">[↑↓]</text> Navigate{" "}
        <text fg="#ECF0F1">[Enter]</text> Details{" "}
        <text fg="#ECF0F1">[r]</text> Refresh{" "}
        <text fg="#ECF0F1">[f]</text> Filter{" "}
        <text fg="#ECF0F1">[q]</text> Quit
      </text>
    </box>
  )
}
