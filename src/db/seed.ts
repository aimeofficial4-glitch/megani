import { eq, count } from 'drizzle-orm';
import { db } from './index.ts';
import {
  users,
  roles,
  permissions,
  plans,
  categories,
  indexedDocuments,
  videos,
  videoTranscripts,
  knowledgeMaps,
  knowledgeNodes,
  knowledgeEdges,
  adCampaigns,
  advertisers,
  aiProviders,
  aiProviderModels,
  aiProviderSettings,
  externalSourceConnections,
  videoSources,
  socialMediaSettings,
  advertisementPlacements,
  platformSettings,
} from './schema.ts';
import { hashPassword } from '../middleware/auth.ts';
import { ensureAdminAccountRecord } from '../services/adminAuth.ts';
import { ensureBrandKnowledgeSeeded } from '../services/brandKnowledgeService.ts';

let seedPromise: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeed().catch((err) => {
      console.error('Database seed failed:', err);
      seedPromise = null;
    });
  }
  return seedPromise;
}

async function runSeed() {
  // 1. Seed Roles & Permissions
  const roleSeeds = [
    { name: 'guest', description: 'Unauthenticated public visitor with configured search access' },
    { name: 'free', description: 'Registered user on the Free tier with ad-supported access' },
    { name: 'premium', description: 'Paid subscriber with ad-free workstation and higher quotas' },
    { name: 'admin', description: 'Platform administrator with full operational & security governance' },
  ];
  for (const r of roleSeeds) {
    await db.insert(roles).values(r).onConflictDoNothing({ target: roles.name });
  }

  const permSeeds = [
    { code: 'search.read', description: 'Execute global and specialized search queries' },
    { code: 'ai.ask', description: 'Query 2MR Ask and Research Intelligence' },
    { code: 'library.manage', description: 'Create and manage personal saved items and collections' },
    { code: 'admin.users', description: 'Manage user accounts and role assignments' },
    { code: 'admin.ads', description: 'Manage 2MR Ads campaigns and analytics' },
    { code: 'admin.payments', description: 'Inspect and reconcile payment transactions' },
    { code: 'admin.feedback', description: 'Manage and reply to user feedback submissions' },
    { code: 'admin.ai', description: 'Configure Multi-AI providers, models, and monitor AI usage & costs' },
    { code: 'admin.security', description: 'Manage admin security policies, 2FA, and audit logs' },
    { code: 'admin.videos', description: 'Manage educational videos and official video sources' },
    { code: 'admin.settings', description: 'Manage platform system settings and official social media' },
    { code: 'admin.roles', description: 'Manage RBAC roles and permission mappings' },
  ];
  for (const p of permSeeds) {
    await db.insert(permissions).values(p).onConflictDoNothing({ target: permissions.code });
  }

  // 2. Seed Official Initial Administrators (2mr@proton.me & aimeofficial4@gmail.com)
  const adminBootstrapList = [
    { email: '2mr@proton.me', fullName: 'Gihozo Aime (2MR Admin)' },
    { email: 'aimeofficial4@gmail.com', fullName: 'Gihozo Aime (Authorized Admin)' },
  ];
  const extraBootstrap = process.env.ADMIN_BOOTSTRAP_EMAIL?.toLowerCase().trim();
  if (extraBootstrap && !adminBootstrapList.some((a) => a.email === extraBootstrap)) {
    adminBootstrapList.push({ email: extraBootstrap, fullName: '2MR Authorized Administrator' });
  }

  for (const adminInfo of adminBootstrapList) {
    const existingAdmin = await db
      .select()
      .from(users)
      .where(eq(users.email, adminInfo.email))
      .limit(1);

    let adminUserId: string;
    if (existingAdmin.length === 0) {
      const initialPwd = process.env.ADMIN_INITIAL_PASSWORD;
      const [insertedAdmin] = await db
        .insert(users)
        .values({
          email: adminInfo.email,
          fullName: adminInfo.fullName,
          organization: '2MR – To Master Research',
          role: 'admin',
          status: 'active',
          emailVerified: true,
          twoFactorEnabled: false,
          passwordHash: initialPwd ? hashPassword(initialPwd) : null,
          aiQueriesLimit: 10000,
          storageLimitMb: 102400,
          avatarUrl: '/src/assets/images/avatar_researcher_profile_1794549073513.jpg',
        })
        .returning();
      adminUserId = insertedAdmin.id;
    } else {
      adminUserId = existingAdmin[0].id;
    }

    await ensureAdminAccountRecord(adminUserId, adminInfo.email);
  }

  // 3. Seed Subscription Plans
  const planSeeds = [
    {
      slug: 'free',
      name: 'Free Explorer',
      description: 'Essential global search, foundational research tools, and personal library.',
      monthlyPriceUsd: 0,
      annualPriceUsd: 0,
      monthlyPriceRwf: 0,
      annualPriceRwf: 0,
      aiMonthlyLimit: 50,
      storageLimitMb: 1024,
      adFree: false,
      features: [
        'Global multi-source search across permitted indexes',
        'Basic Research Intelligence comparisons',
        '50 AI Ask & synthesis queries per month',
        'Personal My Knowledge library (1 GB)',
        'Supported by clearly labelled 2MR Ads',
      ],
    },
    {
      slug: 'premium',
      name: '2MR Premium',
      description: 'Complete research workstation with expanded AI limits, exports, and zero ads.',
      monthlyPriceUsd: 19,
      annualPriceUsd: 190,
      monthlyPriceRwf: 25000,
      annualPriceRwf: 250000,
      aiMonthlyLimit: 5000,
      storageLimitMb: 51200,
      adFree: true,
      features: [
        '100% ad-free research experience platform-wide',
        '5,000 AI Ask & deep Research Intelligence queries / month',
        'Full Research Builder PDF & DOCX report exports',
        'Enhanced Video Intelligence transcript search & notes',
        'Unlimited Knowledge Maps & 50 GB personal storage',
      ],
    },
  ];
  for (const plan of planSeeds) {
    await db.insert(plans).values(plan).onConflictDoNothing({ target: plans.slug });
  }

  // 4. Seed All 12 Categories
  const categorySeeds = [
    {
      slug: 'technology',
      name: 'Technology',
      description: 'Computing architectures, artificial intelligence, distributed systems, and software engineering.',
      icon: 'Cpu',
      subtopics: ['Artificial Intelligence', 'Quantum Computing', 'Cloud Architecture', 'Robotics', 'Semiconductors'],
      resourceCount: 18450,
    },
    {
      slug: 'science',
      name: 'Science',
      description: 'Physics, chemistry, molecular biology, materials research, and fundamental scientific inquiry.',
      icon: 'Atom',
      subtopics: ['Quantum Physics', 'Materials Science', 'Astrophysics', 'Organic Chemistry', 'Genomics'],
      resourceCount: 24100,
    },
    {
      slug: 'education',
      name: 'Education',
      description: 'Pedagogy, cognitive learning sciences, open educational resources, and research methodology.',
      icon: 'GraduationCap',
      subtopics: ['Systematic Reviews', 'EdTech', 'Curriculum Design', 'Academic Literacy', 'STEM Learning'],
      resourceCount: 11200,
    },
    {
      slug: 'business',
      name: 'Business',
      description: 'Macroeconomics, financial technology, global supply chains, entrepreneurship, and governance.',
      icon: 'Briefcase',
      subtopics: ['Macroeconomics', 'FinTech', 'Operations Strategy', 'Digital Trade', 'Market Analytics'],
      resourceCount: 14300,
    },
    {
      slug: 'health',
      name: 'Health',
      description: 'Public health, clinical epidemiology, biomedical therapeutics, and global healthcare policy.',
      icon: 'HeartPulse',
      subtopics: ['Epidemiology', 'CRISPR Therapeutics', 'Immunology', 'Global Health Policy', 'Neuroscience'],
      resourceCount: 21800,
    },
    {
      slug: 'environment',
      name: 'Environment',
      description: 'Climate modeling, renewable energy systems, conservation ecology, and carbon mitigation.',
      icon: 'Leaf',
      subtopics: ['Climate Systems', 'Clean Energy', 'Oceanography', 'Biodiversity', 'Carbon Capture'],
      resourceCount: 15400,
    },
    {
      slug: 'history',
      name: 'History',
      description: 'Historical archives, economic history, civilizations, constitutional development, and historiography.',
      icon: 'Landmark',
      subtopics: ['Modern History', 'History of Science', 'African Heritage', 'Diplomatic Archives', 'Archaeology'],
      resourceCount: 9600,
    },
    {
      slug: 'agriculture',
      name: 'Agriculture',
      description: 'Precision agronomy, soil microbiology, drought-resilient crops, and sustainable food security.',
      icon: 'Sprout',
      subtopics: ['Precision Farming', 'Soil Health', 'Crop Genetics', 'AgriTech', 'Water Irrigation'],
      resourceCount: 7850,
    },
    {
      slug: 'engineering',
      name: 'Engineering',
      description: 'Civil infrastructure, aerospace propulsion, solid-state batteries, and mechatronic systems.',
      icon: 'Wrench',
      subtopics: ['Electrical Systems', 'Aerospace', 'Battery Engineering', 'Structural Mechanics', 'Robotics'],
      resourceCount: 16200,
    },
    {
      slug: 'cybersecurity',
      name: 'Cybersecurity',
      description: 'Post-quantum cryptography, zero-trust network architecture, kernel security, and threat intelligence.',
      icon: 'ShieldCheck',
      subtopics: ['Post-Quantum Crypto', 'Zero Trust', 'Linux Kernel Security', 'Network Defense', 'Threat Analysis'],
      resourceCount: 12800,
    },
    {
      slug: 'sports',
      name: 'Sports',
      description: 'Sports biomechanics, exercise physiology, athletic analytics, and sports medicine research.',
      icon: 'Trophy',
      subtopics: ['Biomechanics', 'Sports Nutrition', 'Performance Telemetry', 'Injury Prevention', 'Coaching Science'],
      resourceCount: 5400,
    },
    {
      slug: 'arts-and-culture',
      name: 'Arts and Culture',
      description: 'Digital humanities, architectural heritage, comparative linguistics, media studies, and musicology.',
      icon: 'Palette',
      subtopics: ['Digital Humanities', 'World Literature', 'Architecture', 'Linguistics', 'Cultural Preservation'],
      resourceCount: 8300,
    },
  ];
  for (const cat of categorySeeds) {
    await db.insert(categories).values(cat).onConflictDoNothing({ target: categories.slug });
  }

  // 5. Seed Real Open-Access Indexed Documents (only if empty)
  const [{ value: docCount }] = await db.select({ value: count() }).from(indexedDocuments);
  if (docCount === 0) {
    await db.insert(indexedDocuments).values([
      {
        title: 'NIST Post-Quantum Cryptography Standardization (FIPS 203, 204, 205)',
        url: 'https://csrc.nist.gov/projects/post-quantum-cryptography',
        domain: 'csrc.nist.gov',
        snippet:
          'Official U.S. National Institute of Standards and Technology standards specifying ML-KEM, ML-DSA, and SLH-DSA to secure communications against quantum cryptanalysis.',
        modality: 'research',
        sourceName: 'NIST Computer Security Resource Center',
        publishedDate: '2024-08-13',
        categorySlug: 'cybersecurity',
        authors: ['NIST Cryptographic Technology Group'],
        keywords: ['Post-Quantum Cryptography', 'FIPS 203', 'ML-KEM', 'NIST'],
        isFeatured: true,
        isPublished: true,
      },
      {
        title: 'IPCC Sixth Assessment Report: Climate Change Mitigation & Pathways',
        url: 'https://www.ipcc.ch/assessment-report/ar6/',
        domain: 'ipcc.ch',
        snippet:
          'Comprehensive global scientific synthesis evaluating greenhouse gas trajectories, renewable energy grid integration, and carbon removal feasibility.',
        modality: 'academic',
        sourceName: 'Intergovernmental Panel on Climate Change',
        publishedDate: '2023-03-20',
        categorySlug: 'environment',
        authors: ['IPCC Working Group III'],
        keywords: ['Climate Science', 'Net Zero', 'Renewable Energy', 'IPCC'],
        isFeatured: true,
        isPublished: true,
      },
      {
        title: 'WHO Guidelines on Ethics and Governance of Artificial Intelligence for Health',
        url: 'https://www.who.int/publications/i/item/9789240029200',
        domain: 'who.int',
        snippet:
          'Global public health framework establishing transparency, clinical validation, and human accountability standards for medical AI systems.',
        modality: 'research',
        sourceName: 'World Health Organization',
        publishedDate: '2024-01-18',
        categorySlug: 'health',
        authors: ['World Health Organization Digital Health'],
        keywords: ['AI in Healthcare', 'Medical Ethics', 'Diagnostics', 'WHO'],
        isFeatured: true,
        isPublished: true,
      },
      {
        title: 'Attention Is All You Need — Transformer Architecture Foundations',
        url: 'https://arxiv.org/abs/1706.03762',
        domain: 'arxiv.org',
        snippet:
          'Foundational sequence transduction paper introducing self-attention mechanisms that underpin modern large language models and retrieval systems.',
        modality: 'academic',
        sourceName: 'arXiv Computer Science',
        publishedDate: '2017-06-12',
        categorySlug: 'technology',
        authors: ['Ashish Vaswani', 'Noam Shazeer', 'Niki Parmar'],
        keywords: ['Transformers', 'Deep Learning', 'Self-Attention', 'NLP'],
        doi: '10.48550/arXiv.1706.03762',
        isFeatured: true,
        isPublished: true,
      },
      {
        title: 'FAO State of Food Security and Climate-Resilient Agriculture',
        url: 'https://www.fao.org/publications/home/fao-flagship-publications/the-state-of-food-security-and-nutrition-in-the-world/en',
        domain: 'fao.org',
        snippet:
          'Global agronomic analysis of drought-tolerant cultivars, soil organic carbon restoration, and precision irrigation across developing agricultural regions.',
        modality: 'research',
        sourceName: 'Food and Agriculture Organization of the UN',
        publishedDate: '2025-07-10',
        categorySlug: 'agriculture',
        authors: ['FAO Economic and Social Development'],
        keywords: ['Food Security', 'Agronomy', 'Precision Agriculture'],
        isFeatured: false,
        isPublished: true,
      },
      {
        title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
        url: 'https://arxiv.org/abs/2005.11401',
        domain: 'arxiv.org',
        snippet:
          'Demonstrates combining parametric sequence models with non-parametric dense vector indexes to ground generated answers in verifiable source documents.',
        modality: 'academic',
        sourceName: 'arXiv Computation and Language',
        publishedDate: '2020-05-22',
        categorySlug: 'technology',
        authors: ['Patrick Lewis', 'Ethan Perez', 'Aleksandra Piktus'],
        keywords: ['RAG', 'Information Retrieval', 'Citations', 'NLP'],
        doi: '10.48550/arXiv.2005.11401',
        isFeatured: true,
        isPublished: true,
      },
    ]);
  }

  // 6. Seed Authorized Educational Videos & Transcripts (only if empty)
  const [{ value: vidCount }] = await db.select({ value: count() }).from(videos);
  if (vidCount === 0) {
    const insertedVideos = await db
      .insert(videos)
      .values([
        {
          title: 'Fault-Tolerant Quantum Architectures & Cryogenic Engineering',
          channel: '2MR Science Lectures',
          description:
            'Explore how physical qubits, dilution refrigerators, and surface code error correction work together to enable reliable quantum computation.',
          categorySlug: 'science',
          duration: '28:45',
          videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          thumbnailUrl: '/src/assets/images/video_quantum_lecture_1794549072425.jpg',
          aiSummary:
            'Covers qubit superposition, Bell-state entanglement, thermal decoherence bottlenecks below 15 millikelvin, and why topological surface codes reduce logical error rates.',
          keyTimestamps: [
            { time: 0, label: 'Superposition & Bloch Sphere', summary: 'Quantum state amplitudes vs classical bits' },
            { time: 18, label: 'Entanglement & CNOT Gates', summary: 'Correlated multi-qubit states and gate fidelity' },
            { time: 36, label: 'Cryogenic Decoherence Limits', summary: 'Mitigating thermal noise in dilution refrigerators' },
            { time: 52, label: 'Surface Code Error Correction', summary: 'Syndrome measurement across physical qubit lattices' },
          ],
          keyConcepts: ['Superposition', 'Entanglement', 'Decoherence', 'Surface Codes', 'Cryogenics'],
          publishedAt: '2026-02-10',
          isFeatured: true,
          isPublished: true,
        },
        {
          title: 'Distributed Retrieval-Augmented Generation & Vector Indexing',
          channel: '2MR Systems Academy',
          description:
            'Architectural breakdown of hybrid dense-sparse search, HNSW vector quantization, and evidence-grounded AI research synthesis.',
          categorySlug: 'technology',
          duration: '34:10',
          videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
          thumbnailUrl: '/src/assets/images/video_ai_systems_1794549072309.jpg',
          aiSummary:
            'Explains how modern search platforms combine OpenSearch lexical matching with pgvector embeddings and cross-encoder re-ranking to eliminate fabricated citations.',
          keyTimestamps: [
            { time: 0, label: 'Limitations of Parametric Memory', summary: 'Why LLMs require live retrieval grounding' },
            { time: 20, label: 'Hybrid OpenSearch + pgvector', summary: 'Combining BM25 recall with semantic embeddings' },
            { time: 40, label: 'Citation Verification Pipelines', summary: 'Linking factual claims back to primary DOIs' },
          ],
          keyConcepts: ['RAG', 'OpenSearch', 'pgvector', 'Citation Grounding'],
          publishedAt: '2026-01-24',
          isFeatured: true,
          isPublished: true,
        },
        {
          title: 'CRISPR Epigenetic Regulation & Precision Molecular Optics',
          channel: '2MR Biomedical Briefing',
          description:
            'How catalytically inactive dCas9 effectors modulate gene expression safely without introducing double-stranded DNA breaks.',
          categorySlug: 'health',
          duration: '22:15',
          videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
          thumbnailUrl: '/src/assets/images/video_biotech_lab_1794549072743.jpg',
          aiSummary:
            'Reviews dCas9 transcriptional repressors, lipid nanoparticle delivery, and off-target safety profiling in modern therapeutic trials.',
          keyTimestamps: [
            { time: 0, label: 'From Cas9 Cutting to dCas9 Epigenetics', summary: 'Reversible gene regulation mechanisms' },
            { time: 24, label: 'Lipid Nanoparticle Delivery', summary: 'Targeted tissue specificity in clinical trials' },
          ],
          keyConcepts: ['CRISPR-dCas9', 'Epigenetics', 'Histone Methylation', 'Lipid Nanoparticles'],
          publishedAt: '2026-02-28',
          isFeatured: true,
          isPublished: true,
        },
      ])
      .returning();

    if (insertedVideos.length > 0) {
      await db.insert(videoTranscripts).values([
        {
          videoId: insertedVideos[0].id,
          startSeconds: 0,
          endSeconds: 17,
          speaker: 'Prof. Vance',
          text: 'Welcome to this 2MR research briefing on fault-tolerant quantum computing architectures and cryogenic engineering.',
        },
        {
          videoId: insertedVideos[0].id,
          startSeconds: 18,
          endSeconds: 35,
          speaker: 'Prof. Vance',
          text: 'Unlike classical bits, quantum bits occupy coherent superpositions and become entangled through multi-qubit CNOT gates.',
        },
        {
          videoId: insertedVideos[0].id,
          startSeconds: 36,
          endSeconds: 51,
          speaker: 'Prof. Vance',
          text: 'Ambient thermal noise causes decoherence in microseconds unless processors are cooled inside multi-stage dilution refrigerators.',
        },
        {
          videoId: insertedVideos[0].id,
          startSeconds: 52,
          endSeconds: 70,
          speaker: 'Prof. Vance',
          text: 'Surface code error correction interleaves data qubits with ancilla syndrome qubits to detect bit-flip and phase-flip errors continuously.',
        },
        {
          videoId: insertedVideos[1].id,
          startSeconds: 0,
          endSeconds: 19,
          speaker: 'Dr. Takahashi',
          text: 'Pure language models cannot reliably verify emerging facts without live retrieval-augmented generation over indexed documents.',
        },
        {
          videoId: insertedVideos[1].id,
          startSeconds: 20,
          endSeconds: 39,
          speaker: 'Dr. Takahashi',
          text: 'Combining OpenSearch lexical BM25 scoring with pgvector semantic search yields high-precision academic citations.',
        },
        {
          videoId: insertedVideos[2].id,
          startSeconds: 0,
          endSeconds: 23,
          speaker: 'Dr. Lin',
          text: 'Epigenetic CRISPR editors allow researchers to silence or activate target genes without cutting the underlying DNA helix.',
        },
      ]);
    }
  }

  // 7. Seed Default Public Knowledge Map (Cybersecurity)
  const [{ value: mapCount }] = await db.select({ value: count() }).from(knowledgeMaps);
  if (mapCount === 0) {
    const [defaultMap] = await db
      .insert(knowledgeMaps)
      .values({
        title: 'Cybersecurity & Systems Architecture',
        rootTopic: 'Cybersecurity',
        isPublic: true,
      })
      .returning();

    await db.insert(knowledgeNodes).values([
      {
        mapId: defaultMap.id,
        nodeKey: 'cyber',
        label: 'Cybersecurity',
        category: 'Cybersecurity',
        definition: 'The practice of protecting networks, operating systems, applications, and data from unauthorized access or attacks.',
        explanation: 'Encompasses threat modeling, defensive architecture, cryptographic verification, and incident response.',
        depth: 0,
        x: 420,
        y: 260,
        keyConcepts: ['Threat Modeling', 'Zero Trust', 'Defense in Depth'],
      },
      {
        mapId: defaultMap.id,
        nodeKey: 'network',
        label: 'Networking',
        category: 'Technology',
        definition: 'Interconnected computing systems exchanging packets over standardized protocols.',
        explanation: 'Understanding TCP/IP, DNS, TLS, and BGP routing is essential for traffic inspection and perimeter defense.',
        depth: 1,
        x: 220,
        y: 170,
        keyConcepts: ['TCP/IP', 'TLS 1.3', 'BGP Routing'],
      },
      {
        mapId: defaultMap.id,
        nodeKey: 'os',
        label: 'Operating Systems',
        category: 'Engineering',
        definition: 'System software managing hardware resources, process isolation, and memory protection.',
        explanation: 'Controls privilege boundaries between kernel space and user space applications.',
        depth: 2,
        x: 160,
        y: 340,
        keyConcepts: ['Virtual Memory', 'Process Isolation', 'System Calls'],
      },
      {
        mapId: defaultMap.id,
        nodeKey: 'linux',
        label: 'Linux',
        category: 'Technology',
        definition: 'Open-source Unix-like kernel powering cloud infrastructure, containers, and security appliances.',
        explanation: 'Provides namespaces, cgroups, SELinux, and eBPF observability hooks for runtime security.',
        depth: 3,
        x: 320,
        y: 440,
        keyConcepts: ['eBPF', 'Namespaces', 'SELinux'],
      },
      {
        mapId: defaultMap.id,
        nodeKey: 'ethical_hacking',
        label: 'Ethical Hacking',
        category: 'Cybersecurity',
        definition: 'Authorized security testing and vulnerability assessment to strengthen system resilience.',
        explanation: 'Applies structured penetration testing and responsible disclosure to remediate flaws before exploitation.',
        depth: 4,
        x: 560,
        y: 410,
        keyConcepts: ['Penetration Testing', 'CVE Analysis', 'Red Teaming'],
      },
      {
        mapId: defaultMap.id,
        nodeKey: 'pqc',
        label: 'Cryptography',
        category: 'Science',
        definition: 'Mathematical protocols guaranteeing confidentiality, integrity, and authenticity.',
        explanation: 'Includes symmetric AES, public-key signatures, and NIST post-quantum lattice algorithms.',
        depth: 1,
        x: 640,
        y: 180,
        keyConcepts: ['ML-KEM', 'Argon2id', 'Public Key Infrastructure'],
      },
    ]);

    await db.insert(knowledgeEdges).values([
      { mapId: defaultMap.id, sourceKey: 'cyber', targetKey: 'network', relation: 'protects' },
      { mapId: defaultMap.id, sourceKey: 'network', targetKey: 'os', relation: 'runs on' },
      { mapId: defaultMap.id, sourceKey: 'os', targetKey: 'linux', relation: 'exemplified by' },
      { mapId: defaultMap.id, sourceKey: 'linux', targetKey: 'ethical_hacking', relation: 'tested via' },
      { mapId: defaultMap.id, sourceKey: 'cyber', targetKey: 'pqc', relation: 'secured by' },
      { mapId: defaultMap.id, sourceKey: 'cyber', targetKey: 'ethical_hacking', relation: 'validated through' },
    ]);
  }

  // 8. Seed Sample 2MR Ads Campaigns (clearly labelled sponsored slots for free users)
  const [{ value: adCount }] = await db.select({ value: count() }).from(adCampaigns);
  if (adCount === 0) {
    const [adv] = await db
      .insert(advertisers)
      .values({
        name: '2MR Partner Academic Network',
        contactEmail: '2mr@proton.me',
        website: 'https://arxiv.org',
      })
      .returning();

    await db.insert(adCampaigns).values([
      {
        advertiserId: adv.id,
        advertiserName: 'Open Science Infrastructure Grant',
        campaignName: 'Global Open Research Initiative 2026',
        adType: 'banner',
        headline: 'Open-Access Institutional Repository Support for Universities',
        description: 'Connect your university research library to open scholarly discovery indexes with transparent metadata standards.',
        ctaText: 'Explore Standards',
        ctaUrl: 'https://arxiv.org',
        targetCategory: 'All',
        status: 'active',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        budget: 5000,
        impressions: 1240,
        clicks: 48,
      },
      {
        advertiserId: adv.id,
        advertiserName: 'Kigali STEM Research Fellowship',
        campaignName: 'East Africa STEM Research Cohort',
        adType: 'sponsored-result',
        headline: '2026 Applied Science & Cybersecurity Fellowship Applications Open',
        description: 'Sponsored opportunity for graduate researchers investigating distributed systems, agronomy, and public health.',
        ctaText: 'View Eligibility',
        ctaUrl: 'https://csrc.nist.gov',
        targetCategory: 'Technology',
        status: 'active',
        startDate: '2026-02-01',
        endDate: '2026-11-30',
        budget: 3000,
        impressions: 860,
        clicks: 39,
      },
    ]);
  }

  // 9. Seed Multi-AI Providers, Models & Orchestrator Settings
  const [{ value: aiProvCount }] = await db.select({ value: count() }).from(aiProviders);
  if (aiProvCount === 0) {
    const insertedProviders = await db
      .insert(aiProviders)
      .values([
        {
          slug: 'gemini',
          name: 'Google Gemini',
          providerType: 'gemini',
          isEnabled: true,
          isDefault: true,
          priority: 1,
          rateLimitPerMin: 60,
          healthStatus: process.env.GEMINI_API_KEY ? 'healthy' : 'unconfigured',
        },
        {
          slug: 'openai',
          name: 'OpenAI (GPT)',
          providerType: 'openai',
          isEnabled: Boolean(process.env.OPENAI_API_KEY),
          isDefault: false,
          priority: 2,
          rateLimitPerMin: 60,
          healthStatus: process.env.OPENAI_API_KEY ? 'healthy' : 'unconfigured',
        },
        {
          slug: 'anthropic',
          name: 'Anthropic (Claude)',
          providerType: 'anthropic',
          isEnabled: Boolean(process.env.ANTHROPIC_API_KEY),
          isDefault: false,
          priority: 3,
          rateLimitPerMin: 50,
          healthStatus: process.env.ANTHROPIC_API_KEY ? 'healthy' : 'unconfigured',
        },
        {
          slug: 'custom',
          name: 'Custom OpenAI-Compatible Provider',
          providerType: 'openai_compatible',
          baseUrl: process.env.CUSTOM_AI_BASE_URL || null,
          isEnabled: Boolean(process.env.CUSTOM_AI_API_KEY),
          isDefault: false,
          priority: 4,
          rateLimitPerMin: 40,
          healthStatus: process.env.CUSTOM_AI_API_KEY ? 'healthy' : 'unconfigured',
        },
      ])
      .returning();

    const bySlug = new Map(insertedProviders.map((p) => [p.slug, p.id]));
    await db.insert(aiProviderModels).values([
      {
        providerId: bySlug.get('gemini')!,
        modelKey: 'gemini-4-hydrogen',
        displayName: 'Gemini 4 Hydrogen (Fast Research Synthesis)',
        capabilities: ['ask', 'research_intelligence', 'deep_research', 'smart_answer'],
        isDefault: true,
        isEnabled: true,
        costPer1kInputMicroUsd: 75,
        costPer1kOutputMicroUsd: 300,
        maxContextTokens: 1000000,
      },
      {
        providerId: bySlug.get('openai')!,
        modelKey: 'gpt-4o-mini',
        displayName: 'GPT-4o Mini (Balanced Synthesis)',
        capabilities: ['ask', 'smart_answer', 'comparison'],
        isDefault: true,
        isEnabled: true,
        costPer1kInputMicroUsd: 150,
        costPer1kOutputMicroUsd: 600,
        maxContextTokens: 128000,
      },
      {
        providerId: bySlug.get('openai')!,
        modelKey: 'gpt-4.1-mini',
        displayName: 'GPT-4.1 Mini (Reasoning & Citations)',
        capabilities: ['research_intelligence', 'deep_research'],
        isDefault: false,
        isEnabled: true,
        costPer1kInputMicroUsd: 400,
        costPer1kOutputMicroUsd: 1600,
        maxContextTokens: 1000000,
      },
      {
        providerId: bySlug.get('anthropic')!,
        modelKey: 'claude-3-5-sonnet-latest',
        displayName: 'Claude 3.5 Sonnet (Deep Analytical Review)',
        capabilities: ['research_intelligence', 'deep_research', 'comparison'],
        isDefault: true,
        isEnabled: true,
        costPer1kInputMicroUsd: 3000,
        costPer1kOutputMicroUsd: 15000,
        maxContextTokens: 200000,
      },
      {
        providerId: bySlug.get('custom')!,
        modelKey: 'gpt-4o-mini',
        displayName: 'Configurable Endpoint Model',
        capabilities: ['ask', 'smart_answer'],
        isDefault: true,
        isEnabled: true,
        costPer1kInputMicroUsd: 100,
        costPer1kOutputMicroUsd: 300,
        maxContextTokens: 128000,
      },
    ]);
  }

  const [{ value: aiSetCount }] = await db.select({ value: count() }).from(aiProviderSettings);
  if (aiSetCount === 0) {
    await db.insert(aiProviderSettings).values({
      multiModelVerificationEnabled: true,
      autoFallbackEnabled: true,
      maxProvidersPerDeepQuery: 3,
      timeoutMs: 15000,
      defaultTemperature: '0.2',
      privacyDisclosureText:
        '2MR Unified AI Intelligence routes research questions through authorized server-side provider APIs (such as Google Gemini, OpenAI, and Anthropic when enabled) and cross-checks claims against retrieved external sources without exposing user credentials.',
    });
  }

  // 10. Seed External Source Connections & Video Sources
  const extSources = [
    {
      slug: 'crossref',
      name: 'CrossRef Scholarly Metadata API',
      sourceType: 'academic_api',
      endpointUrl: 'https://api.crossref.org/works',
      isEnabled: true,
      requiresApiKey: false,
      reliabilityTier: 'high',
      description: 'Peer-reviewed journal DOIs, authors, publishers, and publication dates.',
    },
    {
      slug: 'openalex',
      name: 'OpenAlex Global Research Graph',
      sourceType: 'academic_api',
      endpointUrl: 'https://api.openalex.org/works',
      isEnabled: true,
      requiresApiKey: false,
      reliabilityTier: 'high',
      description: 'Open scholarly works, citations, concepts, and institutional provenance.',
    },
    {
      slug: 'arxiv',
      name: 'arXiv Preprint Repository',
      sourceType: 'academic_api',
      endpointUrl: 'https://export.arxiv.org/api/query',
      isEnabled: true,
      requiresApiKey: false,
      reliabilityTier: 'medium',
      description: 'Scientific preprints across physics, mathematics, computer science, and biology.',
    },
    {
      slug: 'wikipedia',
      name: 'Wikipedia Open Encyclopedia API',
      sourceType: 'encyclopedia',
      endpointUrl: 'https://en.wikipedia.org/w/api.php',
      isEnabled: true,
      requiresApiKey: false,
      reliabilityTier: 'medium',
      description: 'Background encyclopedic summaries and reference overviews.',
    },
    {
      slug: 'youtube',
      name: 'YouTube Data API v3',
      sourceType: 'video_api',
      endpointUrl: 'https://www.googleapis.com/youtube/v3',
      isEnabled: true,
      requiresApiKey: true,
      reliabilityTier: 'medium',
      description: 'Official educational video discovery and 2MR @2mr-z5 channel feed.',
    },
  ];
  for (const s of extSources) {
    await db.insert(externalSourceConnections).values(s).onConflictDoNothing({ target: externalSourceConnections.slug });
  }

  const vidSources = [
    {
      slug: '2mr_hosted',
      name: '2MR Hosted Research Briefings',
      platform: '2mr_hosted',
      baseUrl: '/videos',
      isEnabled: true,
      requiresApiKey: false,
      embedPolicy: '2mr_native_player_with_optional_free_tier_ads',
    },
    {
      slug: 'youtube_v3',
      name: 'YouTube Educational Channels & @2mr-z5',
      platform: 'youtube_api_v3',
      baseUrl: 'https://www.youtube.com',
      isEnabled: true,
      requiresApiKey: true,
      embedPolicy: 'respect_provider_embeddable_no_player_ad_injection',
    },
  ];
  for (const vs of vidSources) {
    await db.insert(videoSources).values(vs).onConflictDoNothing({ target: videoSources.slug });
  }

  // 11. Seed Official 2MR YouTube Channel Settings (@2mr-z5)
  await db
    .insert(socialMediaSettings)
    .values({
      platformKey: 'youtube',
      channelName: '2MR – To Master Research',
      handle: '@2mr-z5',
      channelUrl: 'https://www.youtube.com/@2mr-z5',
      profileImageUrl: '/assets/aistudio/2MR_Global_Research_Badge_bf1478c8.png',
      isEnabled: true,
      autoFetchVideos: true,
      updatedBy: 'system',
    })
    .onConflictDoNothing({ target: socialMediaSettings.platformKey });

  // 12. Seed Ad Placements (Strict Third-Party Player Protection)
  const placements = [
    {
      code: 'home_banner',
      name: 'Homepage Discovery Banner',
      placementType: 'banner',
      allowsThirdPartyVideo: false,
      isEnabled: true,
    },
    {
      code: 'search_sponsored',
      name: 'Search Results Sponsored Card',
      placementType: 'search_sponsored',
      allowsThirdPartyVideo: false,
      isEnabled: true,
    },
    {
      code: 'sidebar_discovery',
      name: 'Sidebar Research Discovery Ad',
      placementType: 'sidebar_ad',
      allowsThirdPartyVideo: false,
      isEnabled: true,
    },
    {
      code: 'video_hosted_preroll',
      name: '2MR Hosted Video Pre-Roll (Never Third-Party Players)',
      placementType: 'video_ad',
      allowsThirdPartyVideo: false,
      isEnabled: true,
    },
  ];
  for (const pl of placements) {
    await db.insert(advertisementPlacements).values(pl).onConflictDoNothing({ target: advertisementPlacements.code });
  }

  // 13. Seed Default Platform Settings
  const defaultSettings = [
    {
      settingKey: 'platform_identity',
      category: 'general',
      settingValue: {
        name: '2MR – To Master Research',
        slogan: 'Discover More. Understand Better.',
        supportEmail: '2mr@proton.me',
        phone: '0780558358',
        maintenanceMode: false,
      },
    },
    {
      settingKey: 'security_policy',
      category: 'security',
      settingValue: {
        maxAdminFailedAttempts: 5,
        lockoutMinutes: 15,
        adminSessionHours: 8,
        require2faForPasswordAdmins: false,
        enforceArgon2id: true,
      },
    },
    {
      settingKey: 'ads_policy',
      category: 'ads',
      settingValue: {
        freeTierAdsEnabled: true,
        premiumTierAdFree: true,
        neverInjectIntoThirdPartyPlayers: true,
        maxAdsPerPage: 2,
      },
    },
  ];
  for (const st of defaultSettings) {
    await db.insert(platformSettings).values(st).onConflictDoNothing({ target: platformSettings.settingKey });
  }

  // 14. Seed Verified Official 2MR Brand Knowledge
  await ensureBrandKnowledgeSeeded();
}

