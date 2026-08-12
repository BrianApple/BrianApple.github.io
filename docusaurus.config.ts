import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: '於之开源',
  tagline: '从物联网网关到 API 中间件——用 Netty 打造高并发、多规约的通信基础设施',
  favicon: 'img/favicon.ico',

  url: 'https://BrianApple.github.io',
  baseUrl: '/',

  organizationName: 'BrianApple',
  projectName: 'BrianApple.github.io',

  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',

  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: 'docs',
          editUrl: undefined,
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/og-image.png',
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: '於之开源',
      logo: {
        alt: '於之开源',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: '文档',
        },
        {
          to: 'docs/iotgate/intro',
          label: 'IOTGate',
          position: 'left',
        },
        {
          to: 'docs/hxapigate/intro',
          label: 'HXAPIGate',
          position: 'left',
        },
        {
          to: 'docs/licen/intro',
          label: 'Licen',
          position: 'left',
        },
        {to: 'blog', label: '博客', position: 'left'},
        {href: 'https://BrianApple.github.io/blog-legacy/index.html', label: '旧站', position: 'left'},
        {
          href: 'https://gitee.com/willbeahero',
          label: 'Gitee',
          position: 'right',
        },
        {
          href: 'https://github.com/BrianApple',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: '项目',
          items: [
            {label: 'IOTGate 智能网关', to: 'docs/iotgate/intro'},
            {label: 'IOTGateConsole 控制台', to: 'docs/iotgate-console/intro'},
            {label: 'HXAPIGate API 网关', to: 'docs/hxapigate/intro'},
            {label: 'iRpc RPC 框架', to: 'docs/irpc/intro'},
            {label: 'Licen 授权系统', to: 'docs/licen/intro'},
          ],
        },
        {
          title: '社区',
          items: [
            {label: 'Gitee 主页', href: 'https://gitee.com/willbeahero'},
            {label: 'GitHub 主页', href: 'https://github.com/BrianApple'},
            {label: '博客', to: 'blog'},
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} 於之 · 开源项目文档站`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['java', 'go', 'python', 'c', 'bash', 'json', 'yaml', 'ini', 'markup', 'sql', 'kotlin', 'typescript'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
