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
      <box flexDirection="row">
        <text fg="#ECF0F1">[↑↓]</text>
        <text fg="#888888"> Navigate </text>
        <text fg="#ECF0F1">[Enter]</text>
        <text fg="#888888"> Details </text>
        <text fg="#ECF0F1">[r]</text>
        <text fg="#888888"> Refresh </text>
        <text fg="#ECF0F1">[f]</text>
        <text fg="#888888"> Filter </text>
        <text fg="#ECF0F1">[q]</text>
        <text fg="#888888"> Quit</text>
      </box>
    </box>
  )
}
