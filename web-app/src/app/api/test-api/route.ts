import { NextResponse } from 'next/server';
import { privateKeyToAccount } from 'viem/accounts';

const ENGINE_URL = process.env.ENGINE_URL || 'http://engine:8000';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { network } = body;

    const isTestnet = network === "mainnet" ? false : true;

    // 1. Fetch settings from FastAPI Engine to get wallet address
    let settings: any = {};
    try {
      const settingsRes = await fetch(`${ENGINE_URL}/settings`);
      if (settingsRes.ok) {
        settings = await settingsRes.json();
      }
    } catch (e: any) {
      console.error("[Test API] Gagal fetch settings dari engine:", e.message);
    }

    const walletAddress = settings.wallet_address || "";
    if (!walletAddress) {
      return NextResponse.json({
        success: false,
        error: "Wallet Address belum diisi di menu Settings bot."
      }, { status: 400 });
    }

    // 2. Load Agent Secret based on network
    const envSecret = isTestnet ? process.env.TESTNET_AGENT_SECRET : process.env.MAINNET_AGENT_SECRET;
    if (!envSecret || envSecret.length !== 66) {
      return NextResponse.json({ 
        success: false, 
        error: `AGENT_SECRET untuk ${network} tidak ditemukan di .env. Pastikan Anda sudah mengisinya.` 
      }, { status: 400 });
    }

    // 3. Verify Agent Private Key and derive Agent Address
    let agentAddress = "";
    try {
      const privateKeyHex = envSecret as `0x${string}`;
      const account = privateKeyToAccount(privateKeyHex);
      agentAddress = account.address;
    } catch (e: any) {
      return NextResponse.json({
        success: false,
        error: "AGENT_SECRET tidak valid. Harap periksa kembali format private key Anda di .env."
      }, { status: 400 });
    }

    // 4. Verify wallet state on Hyperliquid L1 (Read-Only)
    let accountValue = "0.00";
    try {
      const infoUrl = isTestnet ? 'https://api.hyperliquid-testnet.xyz/info' : 'https://api.hyperliquid.xyz/info';
      const infoRes = await fetch(infoUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "clearinghouseState", user: walletAddress })
      });
      if (infoRes.ok) {
        const state = await infoRes.json();
        if (state && state.marginSummary) {
          accountValue = state.marginSummary.accountValue || "0.00";
        } else {
          return NextResponse.json({
            success: false,
            error: `Wallet ${walletAddress} tidak aktif atau tidak memiliki saldo di Hyperliquid ${network}.`
          }, { status: 400 });
        }
      } else {
        return NextResponse.json({
          success: false,
          error: `Gagal berkomunikasi dengan bursa Hyperliquid ${network}.`
        }, { status: 400 });
      }
    } catch (e: any) {
      return NextResponse.json({
        success: false,
        error: `Koneksi bursa gagal: ${e.message}`
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      network: isTestnet ? "testnet" : "mainnet",
      walletAddress,
      agentAddress,
      accountValue,
      message: `Koneksi API valid! Wallet Address: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)} | Agent Address: ${agentAddress.slice(0, 6)}...${agentAddress.slice(-4)}`
    });

  } catch (error: any) {
    console.error("[Test API] Error:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
