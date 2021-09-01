import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, ButtonGroup, Dropdown, Image, InputGroup, Nav, Tab } from 'react-bootstrap';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import DropdownItem from 'react-bootstrap/esm/DropdownItem';
import Row from 'react-bootstrap/Row';
import { ArtifactSheet } from '../Artifact/ArtifactSheet';
import { initialBuildSettings } from '../Build/BuildSetting';
import CustomFormControl from '../Components/CustomFormControl';
import { ascensionMaxLevel, milestoneLevels } from '../Data/CharacterData';
import ElementalData from '../Data/ElementalData';
import { DatabaseContext } from '../Database/Database';
import { ICharacter } from '../Types/character';
import { allCharacterKeys, allSlotKeys, CharacterKey } from '../Types/consts';
import { ICalculatedStats } from '../Types/stats';
import { IWeapon } from '../Types/weapon';
import { useForceUpdate, usePromise } from '../Util/ReactUtil';
import { clamp, deepClone } from '../Util/Util';
import WeaponSheet from '../Weapon/WeaponSheet';
import { initialWeapon } from '../Weapon/WeaponUtil';
import Character from './Character';
import CharacterArtifactPane from './CharacterDisplay/CharacterArtifactPane';
import CharacterOverviewPane from './CharacterDisplay/CharacterOverviewPane';
import CharacterTalentPane from './CharacterDisplay/CharacterTalentPane';
import DamageOptionsAndCalculation from './CharacterDisplay/DamageOptionsAndCalculation';
import CharacterSheet from './CharacterSheet';

export const compareAgainstEquippedContext = createContext(undefined)

const CustomMenu = React.forwardRef(
  ({ children, style, className, 'aria-labelledby': labeledBy }: any, ref: any) => {
    return (
      <div
        ref={ref}
        style={{ style, minWidth: "25rem" } as any}
        className={className}
        aria-labelledby={labeledBy}
      >
        <Row>
          {React.Children.toArray(children).map((child, i) => <Col key={i} xs={6}>{child}</Col>)}
        </Row>
      </div>
    );
  },
);
const initialCharacter = (characterKey: CharacterKey): ICharacter => ({
  characterKey, // the game character this is based off
  level: 1,
  ascension: 0,
  hitMode: "avgHit",
  reactionMode: null,
  equippedArtifacts: Object.fromEntries(allSlotKeys.map(sKey => [sKey, ""])) as any,
  equippedWeapon: "",
  conditionalValues: {},
  baseStatOverrides: {}, // overriding the baseStat
  buildSettings: initialBuildSettings(),
  talentLevelKeys: {
    auto: 0,
    skill: 0,
    burst: 0,
  },
  infusionAura: "",
  constellation: 0,
})

type characterEquipWeapon = {
  type: "weapon", id: string
}
type characterReducerStatOverride = {
  type: "statOverride",
  statKey: string
  value: any | undefined
}
export type characterReducerAction = characterEquipWeapon | characterReducerStatOverride | Partial<ICharacter>

type CharacterDisplayCardProps = {
  characterKey?: CharacterKey | "",
  character?: ICharacter,
  setCharacterKey?: (any: CharacterKey) => void
  footer?: JSX.Element
  newBuild?: ICalculatedStats,
  editable?: boolean,
  onClose?: (any) => void,
  tabName?: string
}
export default function CharacterDisplayCard({ characterKey: propCharacterKey, character: propCharacter, setCharacterKey = () => { }, footer, newBuild: propNewBuild, editable = false, onClose, tabName }: CharacterDisplayCardProps) {
  const database = useContext(DatabaseContext)
  const [compareAgainstEquipped, setcompareAgainstEquipped] = useState(false)
  // Use databaseToken anywhere `database._get*` is used
  // Use onDatabaseUpdate when `following` database entries
  const [databaseToken, onDatabaseUpdate] = useForceUpdate()

  // TODO: We probably don't need to fetch all sheets,
  // though this wouldn't affect the performance currently.
  const weaponSheets = usePromise(WeaponSheet.getAll(), [])
  const characterSheets = usePromise(CharacterSheet.getAll(), [])
  const artifactSheets = usePromise(ArtifactSheet.getAll(), [])

  const characterKey = propCharacterKey || propCharacter!.characterKey
  const character = useMemo(() =>
    databaseToken && (propCharacter ?? database._getChar(characterKey) ?? initialCharacter(characterKey)),
    [propCharacter, characterKey, databaseToken, database])
  const weapon = useMemo(() =>
    databaseToken && (propCharacter?.weapon ?? database._getWeapon(character.equippedWeapon)),
    [character.equippedWeapon, propCharacter?.weapon, databaseToken, database])

  const characterSheet = characterSheets?.[characterKey]
  const weaponSheet = weapon ? weaponSheets?.[weapon.key] : undefined
  const sheets = characterSheet && weaponSheet && artifactSheets && { characterSheet, weaponSheet, artifactSheets }

  const characterDispatch = useCallback((action: characterReducerAction): void => {
    const characterKey = propCharacterKey
    if (!characterKey) return

    if ("type" in action) switch (action.type) {
      case "weapon":
        database.setWeaponLocation(action.id, characterKey)
        break
      case "statOverride": {
        const character = database._getChar(characterKey)!
        if (!characterSheet || !weaponSheet) break
        const { statKey, value } = action
        const baseStatOverrides = character.baseStatOverrides
        const baseStatVal = Character.getBaseStatValue(character, characterSheet, weaponSheet, statKey)
        if (baseStatVal === value || baseStatVal === undefined) delete baseStatOverrides[statKey]
        else baseStatOverrides[statKey] = value
        database.updateChar({ ...character, baseStatOverrides }) // TODO: Validate this
        break
      }
    } else
      database.updateChar({ ...database._getChar(characterKey)!, ...action }) // TODO: Validate this
  }, [propCharacterKey, characterSheet, weaponSheet, database])

  useEffect(() => {
    return propCharacterKey ? database.followChar(propCharacterKey, onDatabaseUpdate) : undefined
  }, [propCharacterKey, onDatabaseUpdate, database])

  useEffect(() => {
    if (!propCharacterKey) return // Don't do anything to flex weapon
    if (character.equippedWeapon) return database.followWeapon(character.equippedWeapon, onDatabaseUpdate)

    if (!weaponSheets || !characterSheet?.weaponTypeKey)
      return // Not fully loaded, we can't add default weapon, yet

    const newWeapon: IWeapon = initialWeapon(characterSheet.weaponTypeKey)
    characterDispatch({ type: "weapon", id: database.updateWeapon(newWeapon) })
  }, [propCharacterKey, character.equippedWeapon, weaponSheets, characterSheet?.weaponTypeKey, characterDispatch, onDatabaseUpdate, database])

  const newBuild = useMemo(() => {
    if (!propNewBuild) return
    const newBuild = propNewBuild && deepClone(propNewBuild);
    newBuild.hitMode = character.hitMode;
    newBuild.reactionMode = character.reactionMode;
    return newBuild
  }, [propNewBuild, character.hitMode, character.reactionMode])

  const flexArts = character.artifacts

  const mainStatAssumptionLevel = newBuild?.mainStatAssumptionLevel ?? 0
  const equippedBuild = useMemo(() => characterSheet && weaponSheet && artifactSheets && Character.calculateBuild(character, database, characterSheet, weaponSheet, artifactSheets, mainStatAssumptionLevel), [character, characterSheet, weaponSheet, artifactSheets, mainStatAssumptionLevel, database])
  const commonPaneProps = { character, newBuild, equippedBuild: (!newBuild || compareAgainstEquipped) ? equippedBuild : undefined, editable, characterDispatch, compareAgainstEquipped }
  if (flexArts) (commonPaneProps as any).artifacts = flexArts // from flex
  // main CharacterDisplayCard
  const DamageOptionsAndCalculationEle = sheets && <DamageOptionsAndCalculation {...{ sheets, weaponSheet, character, characterDispatch, newBuild, equippedBuild }} className="mb-2" />
  return (<Card bg="darkcontent" text={"lightfont" as any} >
    <Card.Header>
      <Row>
        <Col xs={"auto"} className="mr-auto">
          {/* character selecter/display */}
          <CharSelectDropdown characterSheet={characterSheet} character={character} weaponSheet={weaponSheet} editable={editable} characterDispatch={characterDispatch} setCharacterKey={setCharacterKey} />
        </Col>
        {Boolean(mainStatAssumptionLevel) && <Col xs="auto"><Alert className="mb-0 py-1 h-100" variant="orange" ><b>Assume Main Stats are Level {mainStatAssumptionLevel}</b></Alert></Col>}
        {/* Compare against new build toggle */}
        {newBuild ? <Col xs="auto">
          <ButtonGroup>
            <Button variant={compareAgainstEquipped ? "primary" : "success"} disabled={!compareAgainstEquipped} onClick={() => setcompareAgainstEquipped(false)}>
              <small>Show New artifact Stats</small>
            </Button>
            <Button variant={!compareAgainstEquipped ? "primary" : "success"} disabled={compareAgainstEquipped} onClick={() => setcompareAgainstEquipped(true)}>
              <small>Compare against equipped artifacts</small>
            </Button>
          </ButtonGroup>
        </Col> : null}
        {Boolean(onClose) && <Col xs="auto" >
          <Button variant="danger" onClick={onClose}>
            <FontAwesomeIcon icon={faTimes} /></Button>
        </Col>}
      </Row>
    </Card.Header>
    {characterKey && sheets && characterSheet && weaponSheet && <Card.Body>
      <compareAgainstEquippedContext.Provider value={compareAgainstEquipped as any}>
        <Tab.Container defaultActiveKey={tabName ? tabName : (newBuild ? "newartifacts" : "character")} mountOnEnter={true} unmountOnExit={true}>
          <Nav variant="pills" className="mb-2 mx-0" fill>
            <Nav.Item >
              <Nav.Link eventKey="character"><h5 className="mb-0">Character</h5></Nav.Link>
            </Nav.Item>
            {newBuild ? <Nav.Item>
              <Nav.Link eventKey="newartifacts"><h5 className="mb-0">New Artifacts</h5></Nav.Link>
            </Nav.Item> : null}
            <Nav.Item>
              <Nav.Link eventKey="artifacts"><h5 className="mb-0">{newBuild ? "Current Artifacts" : "Artifacts"}</h5></Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="talent"><h5 className="mb-0">Talents</h5></Nav.Link>
            </Nav.Item>
          </Nav>
          <Tab.Content>
            <Tab.Pane eventKey="character">
              {DamageOptionsAndCalculationEle}
              <CharacterOverviewPane characterSheet={characterSheet} weaponSheet={weaponSheet} {...commonPaneProps} />
            </Tab.Pane>
            <Tab.Pane eventKey="artifacts" >
              {DamageOptionsAndCalculationEle}
              <CharacterArtifactPane sheets={sheets} artifacts={undefined} {...{ ...commonPaneProps, newBuild: undefined, equippedBuild, }} />
            </Tab.Pane>
            {newBuild ? <Tab.Pane eventKey="newartifacts" >
              {DamageOptionsAndCalculationEle}
              <CharacterArtifactPane sheets={sheets} artifacts={undefined} {...commonPaneProps} />
            </Tab.Pane> : null}
            <Tab.Pane eventKey="talent">
              {DamageOptionsAndCalculationEle}
              <CharacterTalentPane characterSheet={characterSheet} {...commonPaneProps} />
            </Tab.Pane>
          </Tab.Content>
        </Tab.Container>
      </compareAgainstEquippedContext.Provider>
    </Card.Body>}
    {footer && <Card.Footer>
      {footer}
    </Card.Footer>}
  </Card>)
}

type CharSelectDropdownProps = {
  characterSheet?: CharacterSheet,
  weaponSheet?: WeaponSheet,
  character: ICharacter
  editable: boolean
  characterDispatch: (any: characterReducerAction) => void
  setCharacterKey: (any: CharacterKey) => void
}
function CharSelectDropdown({ characterSheet, weaponSheet, character, character: { elementKey = "anemo", level = 1, ascension = 0 }, editable, characterDispatch, setCharacterKey }: CharSelectDropdownProps) {
  const HeaderIconDisplay = characterSheet ? <span >
    <Image src={characterSheet.thumbImg} className="thumb-small my-n1 ml-n2" roundedCircle />
    <h6 className="d-inline"> {characterSheet.name} </h6>
  </span> : <span>Select a Character</span>
  const setLevel = useCallback((level) => {
    level = clamp(level, 1, 90)
    const ascension = ascensionMaxLevel.findIndex(ascenML => level <= ascenML)
    characterDispatch({ level, ascension })
  }, [characterDispatch])
  const ambiguousLevel = ascensionMaxLevel.findIndex(ascenML => level !== 90 && level === ascenML) > 0
  const setAscension = useCallback(() => {
    const lowerAscension = ascensionMaxLevel.findIndex(ascenML => level !== 90 && level === ascenML)
    if (ascension === lowerAscension) characterDispatch({ ascension: ascension + 1 })
    else characterDispatch({ ascension: lowerAscension })
  }, [characterDispatch, ascension, level])
  return <>{editable ? <InputGroup >
    <ButtonGroup as={InputGroup.Prepend}>
      <Dropdown as={ButtonGroup}>
        <Dropdown.Toggle as={Button}>
          {HeaderIconDisplay}
        </Dropdown.Toggle>
        <Dropdown.Menu as={CustomMenu}>
          {[...new Set(allCharacterKeys)].sort().map(charKey => <CharDropdownItem key={charKey} characterKey={charKey} setCharacterKey={setCharacterKey} />)}
        </Dropdown.Menu>
      </Dropdown>
      {characterSheet?.sheet && "talents" in characterSheet?.sheet && <Dropdown as={ButtonGroup}>
        <Dropdown.Toggle as={Button} className={`text-${elementKey}`}>
          <strong>{ElementalData[elementKey].name}</strong>
        </Dropdown.Toggle>
        <Dropdown.Menu >
          {Object.keys(characterSheet.sheet.talents).map(eleKey =>
            <Dropdown.Item key={eleKey} className={`text-${eleKey}`} onClick={() => characterDispatch({ elementKey: eleKey })}><strong>{ElementalData[eleKey].name}</strong></Dropdown.Item>)}
        </Dropdown.Menu>
      </Dropdown>}
    </ButtonGroup>
    <InputGroup.Prepend>
      <InputGroup.Text><strong>Lvl. </strong></InputGroup.Text>
    </InputGroup.Prepend>

    <InputGroup.Append>
      <CustomFormControl placeholder={undefined} className="h-100" onChange={setLevel} value={level} min={1} max={90} disabled={!characterSheet} />
    </InputGroup.Append>
    <InputGroup.Append>
      <Button disabled={!ambiguousLevel || !characterSheet} onClick={setAscension}><strong>/ {ascensionMaxLevel[ascension]}</strong></Button>
    </InputGroup.Append>
    <ButtonGroup as={InputGroup.Append}>
      <Dropdown as={ButtonGroup} >
        <Dropdown.Toggle as={Button} disabled={!characterSheet}>Select Level</Dropdown.Toggle>
        <Dropdown.Menu>
          {milestoneLevels.map(([lv, as]) => {
            const sameLevel = lv === ascensionMaxLevel[as]
            const lvlstr = sameLevel ? `Lv. ${lv}` : `Lv. ${lv}/${ascensionMaxLevel[as]}`
            return <DropdownItem key={`${lv}/${as}`} onClick={() => characterDispatch({ level: lv, ascension: as })}>{lvlstr}</DropdownItem>
          })}
        </Dropdown.Menu>
      </Dropdown>
    </ButtonGroup>
  </InputGroup> : <span>{HeaderIconDisplay} {characterSheet && weaponSheet && Character.getLevelString(character)}</span>}</>
}
function CharDropdownItem({ characterKey, setCharacterKey }) {
  const characterSheet = usePromise(CharacterSheet.get(characterKey), [characterKey])
  if (!characterSheet) return null
  return <Dropdown.Item onClick={() => setCharacterKey(characterKey)} className="pl-2 pr-0">
    <Row>
      <Col xs="auto"><Image src={characterSheet.thumbImg} className={`thumb-small p-0 m-n1 grad-${characterSheet.star}star`} thumbnail /></Col>
      <Col>{characterSheet.name}</Col>
    </Row>
  </Dropdown.Item>
}