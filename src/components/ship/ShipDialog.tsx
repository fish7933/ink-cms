import { useState, useEffect } from 'react';
import { msg } from '@/lib/messages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info, AlertTriangle } from 'lucide-react';
import type { Company, Fleet } from '@/types/models';
import { getFleets } from '@/lib/store';
import { getShipTypes, calculateDWTFromGT, getShipClassification } from '@/services/ship-classification.service';
import { getActiveShipFlags } from '@/services/ship-flag.service';
import type { ShipType, ShipSizeClassification } from '@/types/ship-classification';
import type { ShipFlag } from '@/types/ship-flag';
import type { SalaryTemplate } from '@/lib/salary-store';
import SalaryTemplateViewDialog from '@/components/salary/SalaryTemplateViewDialog';
import { ShipPersonnelTab } from './ShipPersonnelTab';
import ShipCrewRosterTab from './ShipCrewRosterTab';

interface ShipFormData {
  name: string;
  owner_id: string;
  fleet_id: string;
  imo_number: string;
  call_sign: string;
  mmsi: string;
  flag: string;
  ship_type: string;
  gross_tonnage: string;
  dwt: string;
  gt: string;
  built_year: string;
  builder: string;
  shipyard: string;
  classification_society: string;
  port_of_registry: string;
  phone: string;
  email: string;
  engine_type: string;
  engine_power: string;
  speed_max: string;
  speed_service: string;
  fuel_consumption: string;
  crew_capacity: string;
  passenger_capacity: string;
  cargo_capacity: string;
  length_overall: string;
  breadth: string;
  depth: string;
  draft: string;
  is_bbchp?: boolean;
}

interface ShipDialogProps {
  onClose: () => void;
  formData: ShipFormData;
  onFormDataChange: (data: ShipFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  isEditing: boolean;
  companies: Company[];
  shipId?: string;
  salaryTemplate?: SalaryTemplate | null;
}

export default function ShipDialog({
  onClose,
  formData,
  onFormDataChange,
  onSubmit,
  isEditing,
  companies,
  shipId,
  salaryTemplate,
}: ShipDialogProps) {
  const [availableFleets, setAvailableFleets] = useState<Fleet[]>([]);
  const [allFleets, setAllFleets] = useState<Fleet[]>([]);
  const [loadingFleets, setLoadingFleets] = useState(false);
  const [shipTypes, setShipTypes] = useState<ShipType[]>([]);
  const [loadingShipTypes, setLoadingShipTypes] = useState(false);
  const [shipFlags, setShipFlags] = useState<ShipFlag[]>([]);
  const [loadingShipFlags, setLoadingShipFlags] = useState(false);
  const [shipClassification, setShipClassification] = useState<ShipSizeClassification | null>(null);
  const [ownerFleetMismatch, setOwnerFleetMismatch] = useState<string | null>(null);
  const [salaryTemplateDialogOpen, setSalaryTemplateDialogOpen] = useState(false);

  const ownerCompanies = companies.filter(c => c.type === 'owner');

  // Check if selected flag is Korean
  const selectedFlag = shipFlags.find(f => f.code === formData.flag);
  const isKoreanFlag = selectedFlag?.code === 'KR';
  const isForeignFlag = formData.flag && !isKoreanFlag;

  useEffect(() => {
    loadShipTypes();
    loadShipFlags();
    loadAllFleets();
  }, []);

  useEffect(() => {
    if (formData.owner_id) {
      loadFleets(formData.owner_id);
    } else {
      setAvailableFleets([]);
    }
  }, [formData.owner_id]);

  // Check for owner-fleet mismatch
  useEffect(() => {
    checkOwnerFleetMismatch();
  }, [formData.owner_id, formData.fleet_id, allFleets, companies]);

  // Auto-calculate DWT when GT or ship_type changes
  useEffect(() => {
    const gt = Number(formData.gt);
    if (gt > 0 && formData.ship_type) {
      const selectedShipType = shipTypes.find(t => t.name_ko === formData.ship_type);
      const calculatedDWT = calculateDWTFromGT(gt, selectedShipType?.category || formData.ship_type);
      onFormDataChange({
        ...formData,
        dwt: calculatedDWT.toString(),
      });
    }
  }, [formData.gt, formData.ship_type, shipTypes]);

  // Update classification in real-time when DWT or GT changes
  useEffect(() => {
    const updateClassification = async () => {
      const dwt = Number(formData.dwt) || 0;
      const gt = Number(formData.gt) || Number(formData.gross_tonnage) || 0;
      
      if (dwt > 0 || gt > 0) {
        const selectedShipType = shipTypes.find(t => t.name_ko === formData.ship_type);
        const classification = await getShipClassification(dwt, gt, selectedShipType?.id);
        setShipClassification(classification);
      } else {
        setShipClassification(null);
      }
    };
    
    updateClassification();
  }, [formData.dwt, formData.gt, formData.gross_tonnage, formData.ship_type, shipTypes]);

  // Reset BBCHP when flag changes to Korean
  useEffect(() => {
    if (isKoreanFlag && formData.is_bbchp) {
      onFormDataChange({
        ...formData,
        is_bbchp: false,
      });
    }
  }, [isKoreanFlag]);

  const loadShipTypes = async () => {
    setLoadingShipTypes(true);
    try {
      const types = await getShipTypes();
      setShipTypes(types);
    } catch (error) {
      console.error('Error loading ship types:', error);
      setShipTypes([]);
    } finally {
      setLoadingShipTypes(false);
    }
  };

  const loadShipFlags = async () => {
    setLoadingShipFlags(true);
    try {
      const flags = await getActiveShipFlags();
      setShipFlags(flags);
    } catch (error) {
      console.error('Error loading ship flags:', error);
      setShipFlags([]);
    } finally {
      setLoadingShipFlags(false);
    }
  };

  const loadFleets = async (ownerId: string) => {
    setLoadingFleets(true);
    try {
      const fleets = await getFleets(ownerId);
      setAvailableFleets(fleets);
    } catch (error) {
      console.error('Error loading fleets:', error);
      setAvailableFleets([]);
    } finally {
      setLoadingFleets(false);
    }
  };

  const loadAllFleets = async () => {
    try {
      const fleets = await getFleets();
      setAllFleets(fleets);
    } catch (error) {
      console.error('Error loading all fleets:', error);
      setAllFleets([]);
    }
  };

  const checkOwnerFleetMismatch = () => {
    if (!formData.fleet_id || !formData.owner_id) {
      setOwnerFleetMismatch(null);
      return;
    }

    const selectedFleet = allFleets.find(f => f.id === formData.fleet_id);
    if (!selectedFleet) {
      setOwnerFleetMismatch(null);
      return;
    }

    if (selectedFleet.owner_id !== formData.owner_id) {
      const shipOwner = companies.find(c => c.id === formData.owner_id);
      const fleetOwner = companies.find(c => c.id === selectedFleet.owner_id);
      
      setOwnerFleetMismatch(
        msg.ship.ownerMismatch(shipOwner?.name || '알 수 없음', fleetOwner?.name || '알 수 없음')
      );
    } else {
      setOwnerFleetMismatch(null);
    }
  };

  const handleOwnerChange = (ownerId: string) => {
    // Always clear fleet_id when owner changes
    onFormDataChange({
      ...formData,
      owner_id: ownerId,
      fleet_id: '', // Always reset fleet when owner changes
    });
  };

  const handleFleetChange = (fleetId: string) => {
    // Handle the special "__none__" value for no fleet
    onFormDataChange({
      ...formData,
      fleet_id: fleetId === '__none__' ? '' : fleetId,
    });
  };

  const handleGTChange = (value: string) => {
    onFormDataChange({
      ...formData,
      gt: value,
      gross_tonnage: value, // Keep both in sync
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent submission if there's an owner-fleet mismatch
    if (ownerFleetMismatch) {
      alert('선박 소유주와 플릿 소유주가 일치하지 않습니다. 먼저 이 문제를 해결해주세요.');
      return;
    }
    
    onSubmit(e);
  };

  return (
    <form onSubmit={handleSubmit}>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-5 h-9">
              <TabsTrigger value="basic" className="text-xs">기본 정보</TabsTrigger>
              <TabsTrigger value="technical" className="text-xs">기술 정보</TabsTrigger>
              <TabsTrigger value="capacity" className="text-xs">용량</TabsTrigger>
              <TabsTrigger value="personnel" className="text-xs">담당자</TabsTrigger>
              <TabsTrigger value="roster" className="text-xs">승선 현황</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-3 mt-3">
              {ownerFleetMismatch && (
                <Alert variant="destructive" className="animate-in slide-in-from-top-2 duration-200">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle className="text-sm font-semibold">소유주 불일치</AlertTitle>
                  <AlertDescription className="text-xs">
                    {ownerFleetMismatch}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="owner_id" className="text-xs">선주사 *</Label>
                  <Select
                    value={formData.owner_id}
                    onValueChange={handleOwnerChange}
                    required
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="선주사를 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {ownerCompanies.map(company => (
                        <SelectItem key={company.id} value={String(company.id)} className="text-sm">
                          {company.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="fleet_id" className="text-xs">플릿</Label>
                  <Select
                    value={formData.fleet_id || '__none__'}
                    onValueChange={handleFleetChange}
                    disabled={!formData.owner_id || loadingFleets || availableFleets.length === 0}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder={
                        !formData.owner_id ? "먼저 선주사를 선택하세요" :
                        loadingFleets ? "로딩 중..." :
                        availableFleets.length === 0 ? "플릿 없음" :
                        "플릿을 선택하세요"
                      } />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-sm">플릿 없음</SelectItem>
                      {availableFleets.map(fleet => (
                        <SelectItem key={fleet.id} value={String(fleet.id)} className="text-sm">
                          {fleet.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>


              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs">선박명 *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => onFormDataChange({...formData, name: e.target.value})}
                    placeholder="예: MV Ocean Star"
                    required
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="imo_number" className="text-xs">IMO 번호</Label>
                  <Input
                    id="imo_number"
                    value={formData.imo_number}
                    onChange={(e) => onFormDataChange({...formData, imo_number: e.target.value})}
                    placeholder="예: IMO1234567"
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="call_sign" className="text-xs">호출 부호</Label>
                  <Input
                    id="call_sign"
                    value={formData.call_sign}
                    onChange={(e) => onFormDataChange({...formData, call_sign: e.target.value})}
                    placeholder="예: VRXY"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mmsi" className="text-xs">MMSI</Label>
                  <Input
                    id="mmsi"
                    value={formData.mmsi}
                    onChange={(e) => onFormDataChange({...formData, mmsi: e.target.value})}
                    placeholder="예: 123456789"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="flag" className="text-xs">선적 국가 *</Label>
                  <Select
                    value={formData.flag}
                    onValueChange={(value) => onFormDataChange({...formData, flag: value})}
                    required
                    disabled={loadingShipFlags}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder={loadingShipFlags ? "로딩 중..." : "선적국을 선택하세요"} />
                    </SelectTrigger>
                    <SelectContent>
                      {shipFlags.map(flag => (
                        <SelectItem key={flag.id} value={flag.code} className="text-sm">
                          {flag.name_ko} ({flag.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {isForeignFlag && (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-200">
                  <Alert className="bg-blue-50 border-blue-200">
                    <Info className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-xs text-blue-900">
                      외국적 선박입니다. BBCHP(나용선) 여부를 확인해주세요.
                    </AlertDescription>
                  </Alert>
                  
                  <div className="flex items-center space-x-2 p-3 border rounded-md bg-white">
                    <Checkbox
                      id="is_bbchp"
                      checked={formData.is_bbchp || false}
                      onCheckedChange={(checked) => 
                        onFormDataChange({...formData, is_bbchp: checked as boolean})
                      }
                    />
                    <div className="space-y-0.5">
                      <Label
                        htmlFor="is_bbchp"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        BBCHP (Bareboat Charter with Korean Flag)
                      </Label>
                      <p className="text-xs text-gray-500">
                        나용선 선박의 경우 선적국 증서 외에 한국 선박에 준하는 선원 증서가 필요합니다.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ship_type" className="text-xs">선종 *</Label>
                  <Select
                    value={formData.ship_type}
                    onValueChange={(value) => onFormDataChange({...formData, ship_type: value})}
                    disabled={loadingShipTypes}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder={loadingShipTypes ? "로딩 중..." : "선종을 선택하세요"} />
                    </SelectTrigger>
                    <SelectContent>
                      {shipTypes.map(type => (
                        <SelectItem key={type.id} value={type.name_ko} className="text-sm">
                          {type.name_ko} ({type.name})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {shipTypes.length === 0 && !loadingShipTypes && (
                    <p className="text-xs text-amber-600">
                      선종이 없습니다. 선종/분류 관리에서 추가하세요.
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="port_of_registry" className="text-xs">선적항</Label>
                  <Input
                    id="port_of_registry"
                    value={formData.port_of_registry}
                    onChange={(e) => onFormDataChange({...formData, port_of_registry: e.target.value})}
                    placeholder="예: Busan"
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ship_phone" className="text-xs">연락처</Label>
                  <Input
                    id="ship_phone"
                    value={formData.phone}
                    onChange={(e) => onFormDataChange({...formData, phone: e.target.value})}
                    placeholder="예: Sat-Phone 번호"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ship_email" className="text-xs">이메일</Label>
                  <Input
                    id="ship_email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => onFormDataChange({...formData, email: e.target.value})}
                    placeholder="예: master@ship.com"
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="gt" className="text-xs">총톤수 (GT) *</Label>
                  <Input
                    id="gt"
                    type="number"
                    value={formData.gt}
                    onChange={(e) => handleGTChange(e.target.value)}
                    placeholder="예: 50000"
                    required
                    className="h-9 text-sm"
                  />
                  <p className="text-xs text-gray-500">
                    GT 입력 시 DWT가 자동 계산됩니다
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dwt" className="text-xs">재화중량톤수 (DWT)</Label>
                  <Input
                    id="dwt"
                    type="number"
                    value={formData.dwt}
                    onChange={(e) => onFormDataChange({...formData, dwt: e.target.value})}
                    placeholder="예: 80000"
                    className="h-9 text-sm"
                  />
                  <p className="text-xs text-gray-500">
                    자동 계산되거나 직접 입력 가능
                  </p>
                </div>
              </div>

              {shipClassification && (
                <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-blue-900">선박 분류:</span>
                    <Badge className="bg-blue-600 text-white">
                      {shipClassification.name_ko} ({shipClassification.name})
                    </Badge>
                  </div>
                  {shipClassification.description && (
                    <p className="text-xs text-blue-700 mt-1">{shipClassification.description}</p>
                  )}
                </div>
              )}

              {shipId && (
                <div className="p-3 bg-gray-50 rounded-md border">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-700">배정된 급여 템플릿:</span>
                    {salaryTemplate ? (
                      <button type="button" onClick={() => setSalaryTemplateDialogOpen(true)}>
                        <Badge variant="outline" className="text-xs cursor-pointer hover:bg-gray-100">{salaryTemplate.name}</Badge>
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">미배정</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">선박 &gt; 플릿 &gt; 선주 순으로 배정된 템플릿이 적용됩니다. 배정은 급여 템플릿 관리 화면에서 변경할 수 있습니다.</p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="built_year" className="text-xs">건조년도</Label>
                  <Input
                    id="built_year"
                    type="number"
                    value={formData.built_year}
                    onChange={(e) => onFormDataChange({...formData, built_year: e.target.value})}
                    placeholder="예: 2020"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="builder" className="text-xs">건조사</Label>
                  <Input
                    id="builder"
                    value={formData.builder}
                    onChange={(e) => onFormDataChange({...formData, builder: e.target.value})}
                    placeholder="예: Hyundai Heavy Industries"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="shipyard" className="text-xs">조선소</Label>
                  <Input
                    id="shipyard"
                    value={formData.shipyard}
                    onChange={(e) => onFormDataChange({...formData, shipyard: e.target.value})}
                    placeholder="예: Ulsan Shipyard"
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="classification_society" className="text-xs">선급</Label>
                <Input
                  id="classification_society"
                  value={formData.classification_society}
                  onChange={(e) => onFormDataChange({...formData, classification_society: e.target.value})}
                  placeholder="예: Korean Register, Lloyd's Register"
                  className="h-9 text-sm"
                />
              </div>
            </TabsContent>

            <TabsContent value="technical" className="space-y-3 mt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="engine_type" className="text-xs">엔진 종류</Label>
                  <Input
                    id="engine_type"
                    value={formData.engine_type}
                    onChange={(e) => onFormDataChange({...formData, engine_type: e.target.value})}
                    placeholder="예: Diesel"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="engine_power" className="text-xs">엔진 출력 (kW)</Label>
                  <Input
                    id="engine_power"
                    type="number"
                    step="0.01"
                    value={formData.engine_power}
                    onChange={(e) => onFormDataChange({...formData, engine_power: e.target.value})}
                    placeholder="예: 15000"
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="speed_max" className="text-xs">최대 속력 (knots)</Label>
                  <Input
                    id="speed_max"
                    type="number"
                    step="0.1"
                    value={formData.speed_max}
                    onChange={(e) => onFormDataChange({...formData, speed_max: e.target.value})}
                    placeholder="예: 18.5"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="speed_service" className="text-xs">항해 속력 (knots)</Label>
                  <Input
                    id="speed_service"
                    type="number"
                    step="0.1"
                    value={formData.speed_service}
                    onChange={(e) => onFormDataChange({...formData, speed_service: e.target.value})}
                    placeholder="예: 15.0"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fuel_consumption" className="text-xs">연료 소비량 (ton/day)</Label>
                  <Input
                    id="fuel_consumption"
                    type="number"
                    step="0.01"
                    value={formData.fuel_consumption}
                    onChange={(e) => onFormDataChange({...formData, fuel_consumption: e.target.value})}
                    placeholder="예: 35.5"
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="length_overall" className="text-xs">전장 (m)</Label>
                  <Input
                    id="length_overall"
                    type="number"
                    step="0.01"
                    value={formData.length_overall}
                    onChange={(e) => onFormDataChange({...formData, length_overall: e.target.value})}
                    placeholder="예: 225.50"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="breadth" className="text-xs">선폭 (m)</Label>
                  <Input
                    id="breadth"
                    type="number"
                    step="0.01"
                    value={formData.breadth}
                    onChange={(e) => onFormDataChange({...formData, breadth: e.target.value})}
                    placeholder="예: 32.26"
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="depth" className="text-xs">형심 (m)</Label>
                  <Input
                    id="depth"
                    type="number"
                    step="0.01"
                    value={formData.depth}
                    onChange={(e) => onFormDataChange({...formData, depth: e.target.value})}
                    placeholder="예: 18.80"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="draft" className="text-xs">흘수 (m)</Label>
                  <Input
                    id="draft"
                    type="number"
                    step="0.01"
                    value={formData.draft}
                    onChange={(e) => onFormDataChange({...formData, draft: e.target.value})}
                    placeholder="예: 12.50"
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="capacity" className="space-y-3 mt-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="crew_capacity" className="text-xs">선원 정원</Label>
                  <Input
                    id="crew_capacity"
                    type="number"
                    value={formData.crew_capacity}
                    onChange={(e) => onFormDataChange({...formData, crew_capacity: e.target.value})}
                    placeholder="예: 25"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="passenger_capacity" className="text-xs">승객 정원</Label>
                  <Input
                    id="passenger_capacity"
                    type="number"
                    value={formData.passenger_capacity}
                    onChange={(e) => onFormDataChange({...formData, passenger_capacity: e.target.value})}
                    placeholder="예: 12"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cargo_capacity" className="text-xs">화물 용량 (ton)</Label>
                  <Input
                    id="cargo_capacity"
                    type="number"
                    step="0.01"
                    value={formData.cargo_capacity}
                    onChange={(e) => onFormDataChange({...formData, cargo_capacity: e.target.value})}
                    placeholder="예: 75000"
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="personnel" className="mt-3">
              <ShipPersonnelTab
                shipId={shipId}
                ownerId={formData.owner_id}
                fleetId={formData.fleet_id}
              />
            </TabsContent>

            <TabsContent value="roster" className="mt-3">
              <ShipCrewRosterTab shipId={shipId} shipName={formData.name} imoNumber={formData.imo_number} callSign={formData.call_sign} flag={formData.flag} />
            </TabsContent>
          </Tabs>

          <div className="flex gap-2 pt-4 mt-4 border-t">
            <Button
              type="submit"
              className="flex-1 h-9"
              disabled={!!ownerFleetMismatch}
            >
              {isEditing ? '수정' : '등록'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose} className="h-9">
              취소
            </Button>
          </div>

      <SalaryTemplateViewDialog
        open={salaryTemplateDialogOpen}
        onOpenChange={setSalaryTemplateDialogOpen}
        templateId={salaryTemplate?.id ?? null}
        templateName={salaryTemplate?.name}
      />
    </form>
  );
}