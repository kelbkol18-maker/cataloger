import React, { useState, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { extractProductsFromImage, getExchangeRate, ExtractedProduct } from '../services/geminiService';
import { generateCatalogPdf } from '../services/pdfService';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { FileText, Image as ImageIcon, Calculator, Download, Loader2, RefreshCw } from 'lucide-react';

interface Props {
  user: User;
}

interface ProductRow extends ExtractedProduct {
  id: string;
}

export default function Dashboard({ user }: Props) {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [exchangeRate, setExchangeRate] = useState<number>(36.5);
  const [margin, setMargin] = useState<number>(20);
  const [storeName, setStoreName] = useState('My Store');
  const [whatsapp, setWhatsapp] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  
  const [loadingRate, setLoadingRate] = useState(false);
  const [processingFile, setProcessingFile] = useState(false);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setMargin(data.defaultMargin ?? 20);
          setStoreName(data.storeName || user.displayName || 'My Store');
          setWhatsapp(data.whatsappNumber || '');
          setLogoUrl(data.logoUrl || '');
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, `users/${user.uid}`);
      }
      
      refreshRate();
    };
    fetchInitialData();
  }, [user]);

  const refreshRate = async () => {
    setLoadingRate(true);
    const rate = await getExchangeRate('USD', 'TRY');
    setExchangeRate(rate);
    setLoadingRate(false);
  };

  const processImage = async (file: File) => {
    setProcessingFile(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = (reader.result as string).split(',')[1];
        const extracted = await extractProductsFromImage(base64String, file.type);
        const newProducts = extracted.map((p, i) => ({ ...p, id: Date.now().toString() + i }));
        setProducts(prev => [...prev, ...newProducts]);
      };
      reader.readAsDataURL(file);
    } catch (e) {
      console.error(e);
    } finally {
      setProcessingFile(false);
    }
  };

  const processCsv = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const newProducts = results.data.map((row: any, i) => ({
          id: Date.now().toString() + i,
          name: row.name || row.Name || row.Product || 'Unknown Product',
          originalPrice: parseFloat(row.price || row.Price || row.originalPrice || '0')
        }));
        setProducts(prev => [...prev, ...newProducts]);
      }
    });
  };

  const processExcel = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json(worksheet);
      
      const newProducts = json.map((row: any, i) => ({
        id: Date.now().toString() + i,
        name: row.name || row.Name || row.Product || 'Unknown Product',
        originalPrice: parseFloat(row.price || row.Price || row.originalPrice || '0')
      }));
      setProducts(prev => [...prev, ...newProducts]);
    };
    reader.readAsArrayBuffer(file);
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
      processImage(file);
    } else if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
      processCsv(file);
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      processExcel(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg'],
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    multiple: false
  } as any);

  const calculateFinalPrice = (usdPrice: number) => {
    const withMargin = usdPrice * (1 + margin / 100);
    return (withMargin * exchangeRate).toFixed(2);
  };

  const handleGeneratePdf = () => {
    const catalogProducts = products.map(p => ({
      name: p.name,
      price: `TL ${calculateFinalPrice(p.originalPrice)}`
    }));
    generateCatalogPdf(catalogProducts, storeName, whatsapp, logoUrl);
  };

  const removeProduct = (id: string) => {
    setProducts(products.filter(p => p.id !== id));
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">USD to TRY Rate</p>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-bold text-gray-900">₺{exchangeRate.toFixed(2)}</span>
              {loadingRate && <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />}
            </div>
          </div>
          <button onClick={refreshRate} className="p-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors">
            <RefreshCw className={`w-5 h-5 ${loadingRate ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Profit Margin</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={margin}
                onChange={(e) => setMargin(Number(e.target.value))}
                className="text-3xl font-bold text-gray-900 w-24 outline-none bg-transparent border-b-2 border-dashed border-gray-300 focus:border-indigo-500"
              />
              <span className="text-xl font-bold text-gray-400">%</span>
            </div>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <Calculator className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500 mb-1">Total Products</p>
            <span className="text-3xl font-bold text-gray-900">{products.length}</span>
          </div>
          <button
            onClick={handleGeneratePdf}
            disabled={products.length === 0}
            className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Download className="w-5 h-5" />
            <span className="font-medium">Export PDF</span>
          </button>
        </div>
      </div>

      {/* Upload Area */}
      <div 
        {...getRootProps()} 
        className={`border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer transition-all ${
          isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 bg-white hover:border-indigo-400 hover:bg-gray-50'
        }`}
      >
        <input {...getInputProps()} />
        {processingFile ? (
          <div className="flex flex-col items-center">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
            <h3 className="text-xl font-semibold text-gray-900">AI is analyzing your image...</h3>
            <p className="text-gray-500 mt-2">Extracting products and prices using Gemini</p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="flex gap-4 mb-6">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                <ImageIcon className="w-8 h-8" />
              </div>
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                <FileText className="w-8 h-8" />
              </div>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Upload Price List or Image</h3>
            <p className="text-gray-500 max-w-md mx-auto">
              Drag & drop a photo of a paper price list, or upload an Excel/CSV file. Our AI will extract the products automatically.
            </p>
          </div>
        )}
      </div>

      {/* Products Table */}
      {products.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="p-4 font-semibold text-gray-600">Product Name</th>
                  <th className="p-4 font-semibold text-gray-600">Base Price (USD)</th>
                  <th className="p-4 font-semibold text-gray-600">Final Price (TRY)</th>
                  <th className="p-4 font-semibold text-gray-600 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-4">
                      <input
                        type="text"
                        value={product.name}
                        onChange={(e) => {
                          const newName = e.target.value;
                          setProducts(products.map(p => p.id === product.id ? { ...p, name: newName } : p));
                        }}
                        className="w-full bg-transparent outline-none focus:border-b-2 focus:border-indigo-500"
                      />
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">$</span>
                        <input
                          type="number"
                          value={product.originalPrice}
                          onChange={(e) => {
                            const newPrice = parseFloat(e.target.value) || 0;
                            setProducts(products.map(p => p.id === product.id ? { ...p, originalPrice: newPrice } : p));
                          }}
                          className="w-24 bg-transparent outline-none focus:border-b-2 focus:border-indigo-500"
                        />
                      </div>
                    </td>
                    <td className="p-4 font-bold text-indigo-600">
                      ₺{calculateFinalPrice(product.originalPrice)}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => removeProduct(product.id)}
                        className="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
