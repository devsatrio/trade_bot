import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userAddress, network } = body;

    if (!userAddress) {
      return NextResponse.json(
        { error: 'userAddress is required' },
        { status: 400 }
      );
    }

    const isTestnet = network === "mainnet" ? false : true;
    const apiUrl = isTestnet 
      ? 'https://api.hyperliquid-testnet.xyz/info' 
      : 'https://api.hyperliquid.xyz/info';

    // Fetch clearinghouseState to get balance info
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'clearinghouseState',
        user: userAddress,
      }),
    });

    if (!response.ok) {
      throw new Error(`Hyperliquid API returned ${response.status}`);
    }

    const data = await response.json();
    
    // Extract margin summary which contains balance
    const marginSummary = data.marginSummary || {};

    return NextResponse.json({
      success: true,
      address: userAddress,
      accountValue: marginSummary.accountValue || "0.0",
      totalMarginUsed: marginSummary.totalMarginUsed || "0.0",
      totalNtlPos: marginSummary.totalNtlPos || "0.0",
      raw_data: data
    });
  } catch (error) {
    console.error('Error fetching info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch balance info' },
      { status: 500 }
    );
  }
}
