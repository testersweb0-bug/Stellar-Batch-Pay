"use client";

import { useState, useCallback, useEffect } from "react";
import { useToast } from "./use-toast";

export interface LedgerState {
  isConnected: boolean;
  isConnecting: boolean;
  publicKey: string | null;
  error: string | null;
  deviceInfo: string | null;
}

export function useLedger() {
  const { toast } = useToast();
  const [state, setState] = useState<LedgerState>({
    isConnected: false,
    isConnecting: false,
    publicKey: null,
    error: null,
    deviceInfo: null,
  });

  const connect = useCallback(async () => {
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      // Dynamically import Ledger libraries to avoid SSR issues
      const { default: TransportWebUSB } = await import("@ledgerhq/hw-transport-webusb").catch(() => {
        throw new Error("WebUSB transport not available");
      });

      const { default: StellarApp } = await import("@ledgerhq/hw-app-str").catch(() => {
        throw new Error("Stellar Ledger app not available");
      });

      const transport = await TransportWebUSB.create();
      const stellar = new StellarApp(transport) as any;

      // Get app info to verify Stellar app is open
      const appInfo = await stellar.getAppInfo();
      if (!appInfo.appName.includes("Stellar")) {
        throw new Error("Please open the Stellar app on your Ledger device");
      }

      // Get public key from Ledger (first account, path 0)
      const result = await stellar.getPublicKey("44'/148'/0'");

      setState({
        isConnected: true,
        isConnecting: false,
        publicKey: result.publicKey,
        error: null,
        deviceInfo: `Ledger - ${appInfo.appName} v${appInfo.version}`,
      });

      toast({
        title: "Ledger Connected",
        description: `Connected to ${result.publicKey.slice(0, 8)}...${result.publicKey.slice(-4)}`,
      });

      return result.publicKey;
    } catch (error) {
      let errorMessage = "Failed to connect to Ledger";

      if (error instanceof Error) {
        if (error.message.includes("No device selected")) {
          errorMessage = "No Ledger device found. Please connect your Ledger via USB.";
        } else if (error.message.includes("The device is locked")) {
          errorMessage = "Your Ledger device is locked. Please unlock it and try again.";
        } else if (error.message.includes("Stellar app")) {
          errorMessage = "Please open the Stellar app on your Ledger device.";
        } else if (error.message.includes("WebUSB")) {
          errorMessage = "WebUSB not supported. Please use Chrome, Edge, or Opera.";
        } else {
          errorMessage = error.message;
        }
      }

      setState((prev) => ({
        ...prev,
        isConnected: false,
        isConnecting: false,
        error: errorMessage,
      }));

      toast({
        title: "Ledger Connection Failed",
        description: errorMessage,
        variant: "destructive",
      });

      return null;
    }
  }, [toast]);

  const signTransaction = useCallback(async (xdr: string): Promise<string> => {
    if (!state.isConnected) {
      throw new Error("Ledger not connected");
    }

    try {
      const { default: TransportWebUSB } = await import("@ledgerhq/hw-transport-webusb");
      const { default: StellarApp } = await import("@ledgerhq/hw-app-str");

      const transport = await TransportWebUSB.create();
      const stellar = new StellarApp(transport) as any;

      // Sign the transaction using Ledger
      const result = await stellar.signTransaction("44'/148'/0'", xdr);

      return result.signedTxXdr;
    } catch (error) {
      let errorMessage = "Failed to sign transaction with Ledger";

      if (error instanceof Error) {
        if (error.message.includes("Transaction approval request")) {
          errorMessage = "Transaction was rejected on Ledger device";
        } else if (error.message.includes("locked")) {
          errorMessage = "Device locked. Please unlock your Ledger and try again.";
        } else {
          errorMessage = error.message;
        }
      }

      toast({
        title: "Ledger Signing Failed",
        description: errorMessage,
        variant: "destructive",
      });

      throw new Error(errorMessage);
    }
  }, [state.isConnected, toast]);

  const disconnect = useCallback(() => {
    setState({
      isConnected: false,
      isConnecting: false,
      publicKey: null,
      error: null,
      deviceInfo: null,
    });
  }, []);

  // Check if WebUSB is available
  const isWebUSBSupported = typeof navigator !== "undefined" && "usb" in navigator;

  return {
    ...state,
    connect,
    disconnect,
    signTransaction,
    isWebUSBSupported,
  };
}
