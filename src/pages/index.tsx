import React, {useEffect, useState} from 'react';
import Layout from '@theme/Layout';
import Link from '@docusaurus/Link';
import Heading from '@theme/Heading';
import styles from './index.module.css';

type Product = {
  name: string;
  tag: string;
  lang: string;
  desc: string;
  points: string[];
  to: string;
  gitee: string;
  github: string;
  accent: string;
  logo?: string;
  featured?: boolean;
};

const PRODUCTS: Product[] = [
  {
    name: 'IOTGate',
    tag: '旗舰 · 2k+ Star',
    lang: 'Java',
    desc: '基于 Netty 的物联网高并发智能网关，支持多规约解析与设备接入，可大规模集群部署。',
    points: ['Netty 高并发', '多规约解析', '集群部署'],
    to: '/docs/iotgate/intro',
    gitee: 'https://gitee.com/willbeahero/IOTGate',
    github: 'https://github.com/BrianApple/IOTGate',
    accent: '#38bdf8',
    logo: '/img/iotgate/iotgate-logo.png',
    featured: true,
  },
  {
    name: 'IOTGateConsole',
    tag: '配套控制台',
    lang: 'Java',
    desc: 'IOTGate 智能网关控制台：实时查看 GATE CLUSTER 运行状态，远程启停网关、配置多规约策略。',
    points: ['集群监控', '远程启停', '策略配置'],
    to: '/docs/iotgate-console/intro',
    gitee: 'https://gitee.com/willbeahero/IOTGateConsole',
    github: 'https://github.com/BrianApple/IOTGateConsole',
    accent: '#34d399',
    logo: '/img/iotgate/iotgate-logo.png',
  },
  {
    name: 'HXAPIGate',
    tag: 'API 网关',
    lang: 'Java',
    desc: '基于 Netty + Shiro 的高性能零侵入式 API 网关，适用于 REST 微服务的 API 资源授权管理。',
    points: ['零侵入接入', '资源授权', 'Shiro 安全'],
    to: '/docs/hxapigate/intro',
    gitee: 'https://gitee.com/willbeahero/HXAPIGate',
    github: 'https://github.com/BrianApple/HXAPIGate',
    accent: '#a78bfa',
  },
  {
    name: 'Licen',
    tag: '授权系统',
    lang: 'Go',
    desc: '开源 License 管理系统：软件产品交付、授权发放、证书校验、客户授权生命周期全流程管理。',
    points: ['多产品授权', '多语言 SDK', '签发/吊销留痕'],
    to: '/docs/licen/intro',
    gitee: 'https://gitee.com/willbeahero/licen',
    github: 'https://github.com/BrianApple/Licen',
    accent: '#f472b6',
  },
];

const STAT_FALLBACK = {giteeStars: 2368, githubStars: 64, forks: 890};

function useStats() {
  const [stats, setStats] = useState(STAT_FALLBACK);
  useEffect(() => {
    let alive = true;
    const giteeNames = ['IOTGate', 'IOTGateConsole', 'HXAPIGate', 'licen'];
    const githubNames = ['IOTGate', 'IOTGateConsole', 'HXAPIGate', 'Licen'];
    let giteeStars = 0, githubStars = 0, forks = 0, giteeOk = 0, githubOk = 0;
    Promise.all(
      giteeNames.map((n) =>
        fetch(`https://gitee.com/api/v5/repos/willbeahero/${n}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (!d) return;
            giteeStars += d.stargazers_count || 0;
            forks += d.forks_count || 0;
            giteeOk++;
          })
          .catch(() => {})
      )
    ).then(() => {
      if (alive && giteeOk > 0) {
        setStats((s) => ({...s, giteeStars, forks}));
      }
    });
    Promise.all(
      githubNames.map((n) =>
        fetch(`https://api.github.com/repos/BrianApple/${n}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (!d) return;
            githubStars += d.stargazers_count || 0;
            githubOk++;
          })
          .catch(() => {})
      )
    ).then(() => {
      if (alive && githubOk > 0) setStats((s) => ({...s, githubStars}));
    });
    return () => {
      alive = false;
    };
  }, []);
  return stats;
}

function fmt(n: number) {
  return n >= 10000 ? (n / 10000).toFixed(1) + 'w' : String(n);
}

export default function Home(): JSX.Element {
  const stats = useStats();
  return (
    <Layout description="於之的开源项目文档站：IOTGate 物联网网关、IOTGateConsole 控制台、HXAPIGate API 网关、Licen 授权系统的完整教程。">
      <main className={styles.main}>
        {/* Hero */}
        <section className={styles.hero}>
          <div className={styles.heroBadge}>开源作者 · IoT 基础设施方向</div>
          <Heading as="h1" className={styles.heroTitle}>
            於之开源
          </Heading>
          <p className={styles.heroSub}>
            从物联网网关到 API 中间件，用 Netty 打造高并发、多规约的通信基础设施。
            <br />
            每个产品都提供完整教程与示例，让接入变得简单可靠。
          </p>
          <div className={styles.heroStats}>
            <div className={styles.stat}>
              <span className={styles.statNum}>{fmt(stats.giteeStars)}</span>
              <span className={styles.statLabel}>Gitee Stars</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statNum}>{fmt(stats.githubStars)}</span>
              <span className={styles.statLabel}>GitHub Stars</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statNum}>{fmt(stats.forks)}</span>
              <span className={styles.statLabel}>Gitee Forks</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statNum}>4</span>
              <span className={styles.statLabel}>开源产品</span>
            </div>
          </div>
          <div className={styles.heroActions}>
            <Link className="button button--primary button--lg" to="/docs/iotgate/intro">
              开始阅读文档
            </Link>
            <Link className="button button--secondary button--lg" to="https://gitee.com/willbeahero">
              Gitee 主页
            </Link>
          </div>
        </section>

        {/* Products */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <Heading as="h2" className={styles.sectionTitle}>
              产品体系
            </Heading>
            <p className={styles.sectionDesc}>
              设备接入 → 网关管理 → API 开放 → 服务治理 → 商业授权，一站式开源基础设施
            </p>
          </div>

          <div className={styles.grid}>
            {PRODUCTS.map((p) => (
              <div key={p.name} className={`${styles.card} ${p.featured ? styles.cardFeatured : ''}`}>
                {p.logo && (
                  <img src={p.logo} alt={p.name} className={styles.cardLogo} />
                )}
                <div className={styles.cardTop}>
                  <span className={styles.langDot} style={{background: p.accent}} />
                  <span className={styles.lang}>{p.lang}</span>
                  <span className={styles.cardTag} style={{color: p.accent, borderColor: p.accent + '55', background: p.accent + '14'}}>
                    {p.tag}
                  </span>
                </div>
                <Heading as="h3" className={styles.cardTitle}>
                  {p.name}
                </Heading>
                <p className={styles.cardDesc}>{p.desc}</p>
                <ul className={styles.cardPoints}>
                  {p.points.map((pt) => (
                    <li key={pt}>{pt}</li>
                  ))}
                </ul>
                <div className={styles.cardLinks}>
                  <Link to={p.to} className={styles.cardLink}>
                    教程文档 →
                  </Link>
                  <a href={p.gitee} target="_blank" rel="noopener noreferrer" className={styles.cardLink}>
                    Gitee
                  </a>
                  <a href={p.github} target="_blank" rel="noopener noreferrer" className={styles.cardLink}>
                    GitHub
                  </a>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Ecosystem flow */}
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <Heading as="h2" className={styles.sectionTitle}>
              产品如何协同
            </Heading>
          </div>
          <div className={styles.flow}>
            <div className={styles.flowStep}>
              <b>设备接入</b>
              <span>IOTGate 网关<br />多规约 · 高并发</span>
            </div>
            <div className={styles.flowArrow}>→</div>
            <div className={styles.flowStep}>
              <b>网关管理</b>
              <span>IOTGateConsole<br />监控 · 启停 · 策略</span>
            </div>
            <div className={styles.flowArrow}>→</div>
            <div className={styles.flowStep}>
              <b>能力开放</b>
              <span>HXAPIGate<br />零侵入 · 资源授权</span>
            </div>
            <div className={styles.flowArrow}>→</div>
            <div className={styles.flowStep}>
              <b>商业授权</b>
              <span>Licen<br />签发 · 校验 · SDK</span>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
