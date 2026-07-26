const pluginName = "plugin";

void import(`./${pluginName}`);

const loadStaticPlugin = () => import("./static-plugin");
void loadStaticPlugin;
